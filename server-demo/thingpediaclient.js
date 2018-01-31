// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
const url = require('url');

const THINGPEDIA_URL = process.env.THINGPEDIA_URL || 'https://thingpedia.stanford.edu/thingpedia';

function getModule(parsed) {
    if (parsed.protocol === 'https:')
        return https;
    else
        return http;
}

module.exports = class ThingpediaClientHttp {
    constructor(developerKey, locale) {
        this.developerKey = developerKey;
        this.locale = locale || 'en_US';
    }

    getModuleLocation(id) {
        var to = THINGPEDIA_URL + '/download/devices/' + id + '.zip';
        if (this.developerKey)
            to += '?developer_key=' + this.developerKey;

        var parsed = url.parse(to);
        return Q.Promise(function(callback, errback) {
            getModule(parsed).get(parsed, function(res) {
                // make sure we drain the request or we'll keep the TCP connection
                // alive forever!
                res.resume();

                if (res.statusCode != 301) {
                    return errback(new Error('Unexpected HTTP status ' +
                                             res.statusCode +
                                             ' downloading channel ' + id));
                }


                callback(res.headers['location']);
            }).on('error', function(error) {
                errback(error);
            });
        });
    }

    _simpleRequest(to, noAppend) {
        if (!noAppend) {
            to += '?locale=' + this.locale;
            if (this.developerKey)
                to += '&developer_key=' + this.developerKey;
        }

        var parsed = url.parse(to);
        return Q.Promise(function(callback, errback) {
            getModule(parsed).get(parsed, function(res) {
                if (res.statusCode != 200) {
                    // make sure we drain the request or we'll keep the TCP connection
                    // alive forever!
                    res.resume();
                    return errback(new Error('Unexpected HTTP error ' + res.statusCode));
                }

                var data = '';
                res.setEncoding('utf8');
                res.on('data', function(chunk) {
                    data += chunk;
                });
                res.on('end', function() {
                    try {
                        callback(JSON.parse(data));
                    } catch(e) {
                        errback(e);
                    }
                });
            }).on('error', function(error) {
                errback(error);
            });
        });
    }

    getAppCode(appId) {
        var to = THINGPEDIA_URL + '/api/code/devices/' + appId;
        return this._simpleRequest(to);
    }

    getApps(start, limit) {
        var to = THINGPEDIA_URL + '/api/apps';
        to += '?start=' + start + '&limit=' + limit + '&locale=' + this.locale;
        if (this.developerKey)
            to += '&developer_key=' + this.developerKey;
        return this._simpleRequest(to, true);
    }

    getDeviceCode(id) {
        var to = THINGPEDIA_URL + '/api/code/devices/' + id;
        to += '?version=2&locale=' + this.locale;
        if (this.developerKey)
            to += '&developer_key=' + this.developerKey;
        return this._simpleRequest(to, true);
    }

    getSchemas(kinds) {
        var to = THINGPEDIA_URL + '/api/schema/' + kinds.join(',');
        to += '?version=2&locale=' + this.locale;
        if (this.developerKey)
            to += '&developer_key=' + this.developerKey;
        return this._simpleRequest(to, true);
    }

    getMetas(kinds) {
        var to = THINGPEDIA_URL + '/api/schema-metadata/' + kinds.join(',');
        return this._simpleRequest(to);
    }

    getDeviceFactories(klass) {
        var to = THINGPEDIA_URL + '/api/devices';
        if (klass) {
            to += '?class=' + klass;
            if (this.developerKey)
                to += '&developer_key=' + this.developerKey;
            return this._simpleRequest(to, true);
        } else {
            return this._simpleRequest(to);
        }
    }

    getDeviceSetup(kinds) {
        var to = THINGPEDIA_URL + '/api/devices/setup/' + kinds.join(',');
        return this._simpleRequest(to);
    }

    getKindByDiscovery(publicData) {
        var to = THINGPEDIA_URL + '/api/discovery?locale=' + this.locale;
        if (this.developerKey)
            to += '&developer_key=' + this.developerKey;

        var parsed = url.parse(to);
        parsed.method = 'POST';
        parsed.headers = {};
        parsed.headers['Content-Type'] = 'application/json';

        return Q.Promise(function(callback, errback) {
            var req = getModule(parsed).request(parsed, function(res) {
                if (res.statusCode == 404) {
                    res.resume();
                    return errback(new Error('No such device'));
                }
                if (res.statusCode != 200) {
                    res.resume();
                    return errback(new Error('Unexpected HTTP error ' + res.statusCode));
                }

                var data = '';
                res.setEncoding('utf8');
                res.on('data', function(chunk) {
                    data += chunk;
                });
                res.on('end', function() {
                    callback(data);
                });
            });
            req.on('error', errback);
            req.end(JSON.stringify(publicData));
        });
    }

    getExamplesByKey(key, isBase) {
        var to = THINGPEDIA_URL + '/api/examples?locale=' + this.locale + '&key=' + encodeURIComponent(key)
            + '&base=' + (isBase ? '1' : '0');
        if (this.developerKey)
            to += '&developer_key=' + this.developerKey;
        return this._simpleRequest(to, true);
    }

    getExamplesByKinds(kinds, isBase) {
        var to = THINGPEDIA_URL + '/api/examples/by-kinds/' + kinds.join(',') + '?locale=' + this.locale
            + '&base=' + (isBase ? '1' : '0');
        if (this.developerKey)
            to += '&developer_key=' + this.developerKey;
        return this._simpleRequest(to, true);
    }

    clickExample(exampleId) {
        var to = THINGPEDIA_URL + '/api/examples/click/' + exampleId;
        return this._simpleRequest(to);
    }
}
