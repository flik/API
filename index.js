const {parseString} = require('xml2js'),
      {version} = require('./package'),
      request = require('request'),
      chalk = require('chalk');

/**
 * KAMAR API class
 * @class
 */
class KAMAR {
    /**
     * Create a KAMAR instance.
     * @param {object} options - The configuration options - { portal*, year, TT, UserAgent }
     */
    constructor(options) {
        if (!options)
            throw new Error('No options provided');
        if (!options.portal)
            throw new Error('portal URL must be provided. e.g. `remote.takapuna.school.nz` ');
        this.year = options.year || (new Date()).getFullYear();
        this.TT = options.TT || (this.year + 'TT');
        this.portal = options.portal;
        this.UserAgent = options.UserAgent || `Katal API for KAMAR v${version} (Cargo 3.69) [http://git.io/katal]`;
    }

    /**
     * Internal XHR function.
     * @param {object} form - The HTTP form data.
     */
    fetch(form) {
        return new Promise((resolve, reject) => {
            request({
                uri: `https://${this.portal}/api/api.php`,
                method: 'POST',
                form,
                headers: {
                    "content-type": "application/x-www-form-urlencoded",
                    "user-agent": this.UserAgent
                }
            }, (err, response, body) => {
                if (err) 
                    reject(err); //HTTP Request Error  
                parseString(body, (err, result) => {
                    if (err) 
                        reject(err); //XML Parsing Error
                    var thing = Object.keys(result)[0];
                    if (result[thing].Error) 
                        reject({ //KAMAR's "FileMakerPro" server returned an error
                            error: result[thing].Error[0],
                            code: result[thing].ErrorCode[0]
                        });
                    resolve(result);
                });
            });
        });
    }

    /**
     * Authenticate with KAMAR and return Key.
     * @param {object} userObj - The username and password in an object.
     * @returns {Promise}
     */
    authenticate(userObj) {
        return new Promise((resolve, reject) => {
            this.fetch({
                Command: 'Logon',
                Key: 'vtku',
                Username: userObj.username,
                Password: userObj.password
            })
            .then(result => {
                if (result.LogonResults.Success && result.LogonResults.Success[0] == 'YES')
                    return resolve({
                        'username': userObj.username,
                        'key': result.LogonResults.Key[0],
                        'authLevel': Number(result.LogonResults.LogonLevel)
                    });
                reject(result.LogonResults.Error[0]);
            })
            .catch(err => reject(err));
        });
    }

    /**
     * Get Absences - Note that Absence-Statistics are in a seperate file.
     * @param {object} credentials - The username and key in an object.
     * @returns {Promise}
     */
    getAbsences(credentials) {
        return new Promise((resolve, reject) => {
            this.fetch({
                Command: 'GetStudentAttendance',
                Key: credentials.key,
                StudentID: credentials.username,
                Grid: this.TT
            }).then(response => {
                if (!response || !response.StudentAttendanceResults || !response.StudentAttendanceResults.Weeks) {
                    this.WkNo = 1;
                    return reject('No Absences setup, assuming week 1');
                }
                var Ar = response.StudentAttendanceResults.Weeks[0].Week,
                    Absences = [];
                const daysManifest = 'Mon Tue Wed Thu Fri'.split(' ');
                for (var i = 0; i < Ar.length; i++) {
                    Absences[i] = {
                        $: Ar[i].WeekStart[0]
                    };
                    var days = Ar[i].Days[0].Day;
                    for (var j = 0; j < days.length; j++) 
                        Absences[i][daysManifest[j]] = (days[j]._ || '----------').substring(0, 7);
                }
                this.WkNo = Absences.length;
                //console.log(chalk.magenta('Week No.'), chalk.magenta.bold(this.WkNo)); //DEBUG

                resolve(Absences);
            }).catch(err => reject(err));
        });
    }

    /**
     * get Absences Statistics - Note that Absence by period are in a seperate file.
     * @param {object} credentials - The username and key in an object.
     * @returns {Promise}
     */
    getAbsencesStatistics(credentials) {
        return new Promise((resolve, reject) => {
            this.fetch({
                Command: 'GetStudentAbsenceStats',
                Key: credentials.key,
                StudentID: credentials.username,
                Grid: this.year
            }).then(response => {
                if (!response.StudentAbsenceStatsResults.NumberRecords)
                    reject(Error('No Absence Records'));
                resolve(response.StudentAbsenceStatsResults.Students[0].Student[0])
            }).catch(err => reject(err));
        });
    }

    /**
     * Get this- & next week's Timetable.
     * @param {object} credentials - The username, key, and authLevel in an object. If authLevel is 10 then the teacher timetable is dowloaded.
     * @returns {Promise}
     */
    getTimeTable(credentials) {
        return new Promise((resolve, reject) => {
            var thisWkNo = this.WkNo;
            if (!thisWkNo) {
                var msg = 'You must fetch the Absences before you can download the TimeTable - see https://github.com/TGS-App/API/issues/1';
                console.warn(chalk.cyan.bold('[KAMAR-API]'), msg);
                return reject(Error(msg));
            }
            var file = {
                Command: 'GetStudentTimetable',
                Key: credentials.key,
                StudentID: credentials.username,
                Grid: this.TT
            }; 
            if (credentials.authLevel && credentials.authLevel == 10) //If teacher
                file = {
                    Command: 'GetTeacherTimetable',
                    Key: credentials.key,
                    Grid: this.TT,
                    Tchr: credentials.username
                };
            this.fetch(file).then(response => {
                function getTimetableForWeek(weekOffset) {
                    var HTMout = [0,[0,1,0,0,1,0,1,1],[0,1,1,1,1,0,0,1],[0,1,1,0,1,1,0,0],[0,1,1,0,0,1,0,1],[0,1,1,0,1,0,0,0]],
                        TT = response.StudentTimetableResults.Students[0].Student[0].TimetableData,
                        WeekNumber = thisWkNo + weekOffset;

                    for (var day = 1; day <= 5; day++) {
                        HTMout[day] = TT[0]['W' + WeekNumber][0]['D' + day][0].split('|');
                        HTMout[day].length = 8;
                        for (var period = 1; period < 8; period++) {
                            var Px = HTMout[day][period].split('-');
                            HTMout[day][period] = {
                                subject: Px[2],
                                location: Px[4] || Px[2], 
                                teacher: Px[3]
                            };
                        }
                        HTMout[day][0] = 'D-' + day;
                    }
                    return {
                        $weekNo: WeekNumber,
                        "MO": [HTMout[1][1], HTMout[1][2], HTMout[1][3], HTMout[1][4], HTMout[1][5], HTMout[1][6], HTMout[1][7]],
                        "TU": [HTMout[2][1], HTMout[2][2], HTMout[2][3], HTMout[2][4], HTMout[2][5], HTMout[2][6], HTMout[2][7]],
                        "WE": [HTMout[3][1], HTMout[3][2], HTMout[3][3], HTMout[3][4], HTMout[3][5], HTMout[3][6], HTMout[3][7]],
                        "TH": [HTMout[4][1], HTMout[4][2], HTMout[4][3], HTMout[4][4], HTMout[4][5], HTMout[4][6], HTMout[4][7]],
                        "FR": [HTMout[5][1], HTMout[5][2], HTMout[5][3], HTMout[5][4], HTMout[5][5], HTMout[5][6], HTMout[5][7]]
                    };
                }
                resolve({ 
                    thisWk: getTimetableForWeek(0),
                    nextWk: getTimetableForWeek(1)
                });
            }).catch(err => reject(err));
        });
    }

    /**
     * Get this year's calendar. No authentication required.
     * @returns {Promise}
     */
     getCalendar() {
         return new Promise((resolve, reject) => {
            this.fetch({
                Command: 'GetCalendar',
                Year: this.year,
                Key: 'vtku'
            }).then(response => {
                if (response.CalendarResults.ErrorCode[0] != 0)
                    reject(response.CalendarResults.ErrorCode[0])
                var days = response.CalendarResults.Days[0].Day,
                    resp = {};
                for (var i = 0; i < days.length; i++) 
                    resp[days[i].Date] = {
                        'status': days[i].Status[0],
                        'TTday': days[i].DayTT[0] || undefined,
                        'term': days[i].Term[0] || undefined, //no dif to TermA AFAIK, except doesn't exist for holidays
                        'week': days[i].Week[0] || undefined, //no dif to WeekA and WeekYear AFAIK., except doesn't exist for holidays
                    }
                resolve(resp);
            }).catch(err => reject(err));
         });
     }

    /**
     * Get Personal Details about student.
     * @param {object} credentials - The username and key in an object.
     * @returns {Promise}
     */
    getDetails(credentials) {
        return new Promise((resolve, reject) => {
            this.fetch({
                Command: 'GetStudentDetails',
                Key: credentials.key,
                StudentID: credentials.username,
                PastoralNotes: ''
            }).then(response => {
                const _ = response.StudentDetailsResults.Students[0].Student[0];
                resolve({
                    "Names": [_.FirstName[0], _.ForeNames[0], _.LastName[0]],
                    "ID": _.StudentID[0],
                    "Gender": [_.Gender[0] == 'Male' ? '유' : '웃', _.Gender[0]],
                    "Ethnicity": _.Ethnicity[0],
                    "Birthday": [_.DateBirth[0], _.Age[0]],
                    "NSN": _.NSN[0],
                    "LifeA": {
                        Parent: {
                            Title: _.ParentTitle[0], 
                            Email: _.ParentEmail[0], 
                            Name: _.ParentSalutation[0]
                        },
                        Phone: _.HomePhone[0],
                        Address: _.HomeAddress[0]
                    },
                    "LifeB": {
                        Parent: {
                            Title: _.ParentTitleB[0], 
                            Email: _.ParentEmailB[0], 
                            Name: _.ParentSalutationB[0]
                        },
                        Phone: _.HomePhoneB[0],
                        Address: _.HomeAddressB[0]
                    },
                    "Mother": {
                        Name: _.MotherName[0],
                        Email: _.MotherEmail[0],
                        phHome: _.MotherPhoneHome[0],
                        phCell: _.MotherPhoneCell[0],
                        phWork: _.MotherPhoneWork[0],
                        Job: _.MotherOccupation[0],
                        Work: _.MotherWorkAddress[0],
                        Status: _.MotherStatus[0],
                        Notes: _.MotherNotes[0]
                    },
                    "Father": {
                        Name: _.FatherName[0],
                        Email: _.FatherEmail[0],
                        phHome: _.FatherPhoneHome[0],
                        phCell: _.FatherPhoneCell[0],
                        phWork: _.FatherPhoneWork[0],
                        Job: _.FatherOccupation[0],
                        Work: _.FatherWorkAddress[0],
                        Status: _.FatherStatus[0],
                        Notes: _.FatherNotes[0]
                    },
                    "EmergencyContact": {
                        Name: _.EmergencyName[0],
                        phHome: _.EmergencyPhoneHome[0],
                        phCell: _.EmergencyPhoneCell[0],
                        phWork: _.EmergencyPhoneWork[0],
                        Notes: _.EmergencyNotes[0]
                    },
                    "Allowed_Panadol": _.AllowedPanadol[0] == 'Y',
                    "Allowed_Ibuprofen": _.AllowedIbuprofen[0] == 'Y',
                    "Health_Flag": _.HealthFlag[0] == 'Y',
                    "Medical": _.Medical[0] || 'No',
                    "Reactions": _.Reactions[0],
                    "Vaccinations": _.Vaccinations[0],
                    "Special_Circumstances": _.SpecialCircumstances[0],
                    "General_Notes": _.GeneralNotes[0],
                    "Health_Notes": _.HealthNotes[0]
                });
            }).catch(err => reject(err));
        });
    }

    /**
     * get Results - Note that OfficialResults & NCEASummary are both in seperate files.
     * @param {object} credentials - The username and key in an object.
     * @returns {Promise}
     */
    getResults(credentials) {
        return new Promise((resolve, reject) => {
            this.fetch({
                Command: 'GetStudentResults',
                Key: credentials.key,
                StudentID: credentials.username
            }).then(response => {
                var RES = response.StudentResultsResults.ResultLevels[0].ResultLevel,
                    ncea = [],
                    results = [];
                const colourGrade = orgGrade => {
                    var grade = orgGrade;
                         if (grade.match('Excellence'))         grade = `E`;
                    else if (grade.match('Merit'))              grade = `M`;
                    else if (grade.match('Not'))                grade = `N`;
                    else if (grade.match(/Achieve(ment|d)/))    grade = `A`;
                    else                                        console.log('Incomprehensible', grade); //nothing rn for debug - need to investigate with IB grades.
                    return [orgGrade, grade];
                };
                for (var h = 0; h < RES.length; h++) {
                    const Result = RES[h].Results[0].Result;
                    ncea[h] = RES[h].NCEALevel != 0;
                    results[h] = [];
                    for (var i = 0; i < Result.length; i++)
                        results[h].push({
                            'title': Result[i].Title[0],
                            'grade': colourGrade(Result[i].Grade[0]),
                            'datePublished': Result[i].ResultPublished[0],
                            'NCEAStandard': RES[h].NCEALevel != 0 ? (Result[i].Number[0] + ' v' + Result[i].Version[0]) : '',
                            'Credits': Result[i].Credits[0] != 0 ? (Result[i].CreditsPassed[0] + '/' + Result[i].Credits[0]) : '',
                            'NCEALevel': RES[h].NCEALevel != 0 ? ('Level ' + RES[h].NCEALevel) : ''
                        });
                }
                resolve({ ncea, results });
            }).catch(err => reject(err)); 
        });  
    }

    /**
     * search the student database - Note that you must have a teacher's or admin's key to do this.
     * @param {object} credentials - The key in an object. (user must be allowed to do this command)
     * @returns {Promise}
     */
    searchStudents(credentials, query) {
        return new Promise((resolve, reject) => this
            .fetch({
                Command: 'SearchStudents',
                Key: credentials.key,
                Criteria: query
            })
            .then(response => resolve((response.SearchStudentsResults.Students || [{}])[0].Student || []))
            .catch(err => reject(err)));  
    }

    /**
     * get NCEASummary - Note that OfficialResults & Results are both in seperate files.
     * @param {object} credentials - The username and key in an object.
     * @returns {Promise}
     */
    getNCEASummary(credentials) {
        return new Promise((resolve, reject) => {
            this.fetch({
                Command: 'GetStudentNCEASummary',
                Key: credentials.key,
                StudentID: credentials.username
            }).then(response => {
                const $ = response.StudentNCEASummaryResults.Students[0].Student[0],
                    tt = yt => {
                    const s = $[`${yt}Totals`][0][`${yt}Total`],
                          cols = 'NotAchieved Achieved Merit Excellence Total Attempted'.split(' ');
                    var r = [],
                        j;
                    for (var i = 0; i < s.length; i++) {  
                        r[i] = `<td><strong>${s[i][yt][0]}</strong></td>`;
                        for (j = 0; j < cols.length; j++) 
                            r[i] += '<td>' + (!(s[i] && s[i][cols[j]]) ? '' : s[i][cols[j]][0]) + '</td>';    
                    }
                    return '<tr>' + r.join('</tr><tr>') + '</tr>';
                };
                resolve(null, {
                    'qualification': [
                        [ 1,                $.NCEA[0].L1NCEA[0]     ],
                        [ 2,                $.NCEA[0].L2NCEA[0]     ],
                        [ 3,                $.NCEA[0].L3NCEA[0]     ],
                        [ 'UE Literacy',    $.NCEA[0].NCEAUELIT[0]  ],
                        [ 'L1 Literacy',    $.NCEA[0].NCEAL1LIT[0]  ],
                        [ 'Numeracy',       $.NCEA[0].NCEANUM[0]    ],
                    ],
                    'thisYear': {
                        'Internal': !!$.CreditsInternal ? [
                            !$.CreditsInternal[0].NotAchieved ? '' : $.CreditsInternal[0].NotAchieved,
                            !$.CreditsInternal[0].Achieved    ? '' : $.CreditsInternal[0].Achieved,
                            !$.CreditsInternal[0].Merit       ? '' : $.CreditsInternal[0].Merit,
                            !$.CreditsInternal[0].Excellence  ? '' : $.CreditsInternal[0].Excellence,
                            !$.CreditsInternal[0].Total       ? '' : $.CreditsInternal[0].Total,
                            !$.CreditsInternal[0].Attempted   ? '' : $.CreditsInternal[0].Attempted
                        ] : ['', '', '', '', '', ''],
                        'External': !!$.CreditsExternal ? [
                            !$.CreditsExternal[0].NotAchieved ? '' : $.CreditsExternal[0].NotAchieved,
                            !$.CreditsExternal[0].Achieved    ? '' : $.CreditsExternal[0].Achieved,
                            !$.CreditsExternal[0].Merit       ? '' : $.CreditsExternal[0].Merit,
                            !$.CreditsExternal[0].Excellence  ? '' : $.CreditsExternal[0].Excellence,
                            !$.CreditsExternal[0].Total       ? '' : $.CreditsExternal[0].Total,
                            !$.CreditsExternal[0].Attempted   ? '' : $.CreditsExternal[0].Attempted
                        ] : ['', '', '', '', '', ''],
                        'Total': $.CreditsTotal ? [
                            !$.CreditsTotal[0].NotAchieved    ? '' : $.CreditsTotal[0].NotAchieved,
                            !$.CreditsTotal[0].Achieved       ? '' : $.CreditsTotal[0].Achieved,
                            !$.CreditsInternal[0].Merit       ? '' : $.CreditsTotal[0].Merit,
                            !$.CreditsTotal[0].Excellence     ? '' : $.CreditsTotal[0].Excellence,
                            !$.CreditsTotal[0].Total          ? '' : $.CreditsTotal[0].Total,
                            !$.CreditsTotal[0].Attempted      ? '' : $.CreditsTotal[0].Attempted
                        ] : ['', '', '', '', '', '']
                    },
                    year: tt('Year'),
                    level: tt('Level')
                });
            }).catch(err => reject(err));
        });
    }
    
    /**
     * make a request to KAMAR - Note that more convenient methods exist for common files.
     * @param {object} form - All form data in JSON format
     * @returns {Promise}
     */
    sendCommand(form) {
        return new Promise((resolve, reject) => this
            .fetch(form)
            .then(result => resolve(result))
            .catch(error => reject(error))
        );
    }

    /**
     * KAMAR has deprecated the `FileName` atrribute, so the `getFile` method is also deprecated.\nPlease use the `sendCommand` method instead.
     */
    getFile() {
        var up = new Error('KAMAR has deprecated the `FileName` atrribute, so the `getFile` method is also deprecated.\nPlease use the `sendCommand` method instead.');
        throw up; //ha ha
    }

    /**
     * convert Details to vCard (VCF) format.
     * @param {object} credentials - The username and key in an object.
     * @param {object} _ - Response from <getDetails>
     * @returns {string} VCF String
     */
    makevCardFromDetails(credentials, _) { //dont fetch details again, in most use-cases it would already have been fetched.
        return ['BEGIN:VCARD',
            'VERSION:4.0',
            'N:' + _.Names[2] + ';' + _.Names[1] + ';;;',
            'NICKNAME:' + _.Names[0],
            'FN:' + _.Names[1],
            'ORG:Takapuna Grammar School Student #' + _.ID,
            'GENDER:' + _.Gender[1], //Is this even a thing?
            'TITLE:' + _.Ethnicity,
            `PHOTO;MEDIATYPE=image/jpeg:https://${this.portal}/api/img.php?Key=${credentials.key}&Stuid=${_.ID}`,
            'TEL;TYPE=home,voice;home=uri:' + _.LifeA.Phone, //something big-ish needs to happen about this
            'ADR;TYPE=home;home="' + _.LifeA.Address.replace(/\n/g, '\\n') + '":;;' + _.LifeA.Address.replace(/\n/g, '\\n'), //wat?
            'EMAIL:' + _.ID + '@tgs.school.nz',
            'REV:' + (new Date()).toISOString(),
            'BDAY:' + _.Birthday[0], //BDAY doesn't show up, needs to be in the format of `DDMMYYYY`
            'NOTE:Emergency Contact: ' + _.EmergencyContact.Name + ' (' + _.EmergencyContact.phCell + ')',
        'END:VCARD'].join('\n');
    }
};
module.exports = KAMAR;