# TGS App & Skype Bot (project katal)
[![npm version](https://badge.fury.io/js/katal.svg)](https://badge.fury.io/js/katal)
[![Build Status](https://travis-ci.org/TGS-App/API.svg?branch=master)](https://travis-ci.org/TGS-App/API)
[![Inline docs](http://inch-ci.org/github/tgs-app/api.svg?branch=master)](http://inch-ci.org/github/tgs-app/api)
[![Known Vulnerabilities](https://snyk.io/test/github/tgs-app/api/badge.svg)](https://snyk.io/test/github/tgs-app/api)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg?style=flat)](LICENSE)
[![Last Sync](http://kyle2.azurewebsites.net/badge.svg?i=0)](http://tgs.kyle.cf)
[![Scraper](http://kyle2.azurewebsites.net/badge.svg?i=1)](http://tgs.kyle.cf)
[![KAMAR](http://kyle2.azurewebsites.net/badge.svg?i=2)](http://tgs.kyle.cf)

[![NPM](https://nodei.co/npm/katal.png?compact=true)](https://npmjs.org/package/katal)

:school: Web-App & Skype Bot for TGS Daily Notices, news, blog and timetable.   

[![Deploy to Azure](http://azuredeploy.net/deploybutton.png)](https://azuredeploy.net/)

```sh
git clone git://github.com/TGS-App/API.git
cd API
npm install && npm start
```

# Read the database
```handlebars
http://{{base_url}}/api/v1/?q={{item}}
```   

where `{{item}}` is either `notices`, `news` or `blog`.

# KAMAR API

Read the [KAMAR API Docs](KAMAR)