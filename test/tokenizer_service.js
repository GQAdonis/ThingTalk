// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const net = require('net');

const JsonDatagramSocket = require('./json_datagram_socket');

// Interact with almond-tokenizer
module.exports = class TokenizerService {
    constructor(languageTag) {
        this._languageTag = languageTag;

        const socket = new net.Socket();
        socket.connect({
            host: '127.0.0.1',
            port: 8888
        });
        this._socket = new JsonDatagramSocket(socket, socket, 'utf8');
        this._socket.on('data', (msg) => {
            let req = this._requests.get(msg.req);
            if (!req)
                return;
            this._requests.delete(msg.req);

            if (msg.error) {
                req.reject(new Error(msg.error));
            } else {
                req.resolve({
                    tokens: msg.tokens,
                    entities: msg.values
                });
            }
        });

        this._requests = new Map();
        this._nextRequest = 0;
    }

    tokenize(sentence) {
        const reqId = this._nextRequest++;
        return new Promise((resolve, reject) => {
            this._requests.set(reqId, { resolve, reject });

            this._socket.write({ req: reqId, utterance: sentence, languageTag: this._languageTag });
        });
    }
};
