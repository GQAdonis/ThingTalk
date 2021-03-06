// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Type = require('./type');

class DummyMemoryClient {
    constructor() {
        this._tables = new Map;
    }

    getSchema(table) {
        return Promise.resolve(this._tables.get(table) || null);
    }

    createTable(table, args, types) {
        this._tables.set(table, { args: args, types: types });
        return Promise.resolve();
    }
}

module.exports = class SchemaRetriever {
    constructor(tpClient, mClient, silent) {
        this._schemaRequest = null;
        this._pendingSchemaRequests = [];
        this._metaRequest = null;
        this._pendingMetaRequests = [];
        this._cache = new Map;
        this._metaCache = new Map;

        this._thingpediaClient = tpClient;
        this._memoryClient = mClient || new DummyMemoryClient();
        this._silent = !!silent;
    }

    removeFromCache(kind) {
        this._cache.delete(kind);
        this._metaCache.delete(kind);
    }
    clearCache() {
        this._cache.clear();
        this._metaCache.clear();
    }

    injectManifest(kind, manifest) {
        let schema = {};
        for (let what of ['queries', 'actions']) {
            schema[what] = {};
            for (let name in manifest[what]) {
                let block = manifest[what][name];
                let ret = {
                    kind_type: 'primary',
                    args: [],
                    types: [],
                    is_input: [],
                    required: [],
                    is_list: !!block.is_list,
                    is_monitorable: ('poll_interval' in block ?
                        block.poll_interval >= 0 : !!block.is_monitorable)
                };
                for (let arg of block.args) {
                    ret.args.push(arg.name);
                    ret.types.push(Type.fromString(arg.type));
                    ret.is_input.push(arg.is_input);
                    ret.required.push(arg.required);
                }
                schema[what][name] = ret;
            }
        }
        this._cache.set(kind, schema);
    }

    _ensureSchemaRequest() {
        if (this._schemaRequest !== null)
            return;

        this._schemaRequest = Promise.resolve().then(() => {
            var pending = this._pendingSchemaRequests;
            this._pendingSchemaRequests = [];
            this._schemaRequest = null;
            if (pending.length === 0)
                return {};
            if (!this._silent)
                console.log('Batched schema request for ' + pending);
            return this._thingpediaClient.getSchemas(pending, 2);
        }).then((resolved) => {
            for (var kind in resolved) {
                this._parseSchemaTypes(resolved[kind], resolved[kind].triggers);
                this._parseSchemaTypes(resolved[kind], resolved[kind].actions);
                this._parseSchemaTypes(resolved[kind], resolved[kind].queries);
                this._cache.set(kind, resolved[kind]);
            }
            return resolved;
        });
    }

    _parseSchemaTypes(schema, channels) {
        for (var name in channels) {
            channels[name].kind_type = schema.kind_type;
            channels[name].types = channels[name].types.map(Type.fromString);
        }
    }

    _parseMetaTypes(schema, channels) {
        for (var name in channels) {
            channels[name].kind_type = schema.kind_type;
            channels[name].schema = channels[name].schema.map(Type.fromString);
            channels[name].types = channels[name].schema;
        }
    }

    getFullSchema(kind) {
        if (typeof kind !== 'string')
            throw new TypeError();
        if (this._cache.has(kind))
            return Promise.resolve(this._cache.get(kind));

        if (this._pendingSchemaRequests.indexOf(kind) < 0)
            this._pendingSchemaRequests.push(kind);
        this._ensureSchemaRequest();
        return this._schemaRequest.then((everything) => {
            if (kind in everything)
                return everything[kind];
            else
                throw new Error('Invalid kind ' + kind);
        });
    }

    _ensureMetaRequest() {
        if (this._metaRequest !== null)
            return;

        this._metaRequest = Promise.resolve().then(() => {
            var pending = this._pendingMetaRequests;
            this._pendingMetaRequests = [];
            this._metaRequest = null;
            if (!this._silent)
                console.log('Batched schema-meta request for ' + pending);
            return this._thingpediaClient.getMetas(pending);
        }).then((resolved) => {
            for (var kind in resolved) {
                this._parseMetaTypes(resolved[kind], resolved[kind].triggers);
                this._parseMetaTypes(resolved[kind], resolved[kind].actions);
                this._parseMetaTypes(resolved[kind], resolved[kind].queries);
                this._metaCache.set(kind, resolved[kind]);
            }
            return resolved;
        });
    }

    _where(where) {
        switch (where) {
            case 'query': return 'queries';
            case 'action': return 'actions';
            case 'trigger': return 'triggers';
            default: return where;
        }
    }

    getFullMeta(kind) {
        if (typeof kind !== 'string')
            throw new TypeError();
        if (this._metaCache.has(kind))
            return Promise.resolve(this._metaCache.get(kind));

        if (this._pendingMetaRequests.indexOf(kind) < 0)
            this._pendingMetaRequests.push(kind);
        this._ensureMetaRequest();
        return this._metaRequest.then((everything) => {
            if (kind in everything)
                return everything[kind];
            else
                throw new Error('Invalid kind ' + kind);
        });
    }

    getSchema(kind, where, name) {
        where = this._where(where);
        return this.getFullSchema(kind).then((fullSchema) => {
            if (!(name in fullSchema[where]))
                throw new Error("Schema " + kind + " has no " + where + " " + name);
            return fullSchema[where][name].types;
        });
    }

    getSchemaAndNames(kind, where, name) {
        where = this._where(where);
        return this.getFullSchema(kind).then((fullSchema) => {
            if (!(name in fullSchema[where]))
                throw new Error("Schema " + kind + " has no " + where + " " + name);
            return fullSchema[where][name];
        });
    }

    getMeta(kind, where, name) {
        where = this._where(where);
        return this.getFullMeta(kind).then((fullSchema) => {
            if (!(name in fullSchema[where]))
                throw new Error("Schema " + kind + " has no " + where + " " + name);
            return fullSchema[where][name];
        });
    }

    getMetaByChannel(channel) {
        let kind = channel.device.kind;
        let where = channel.channelType;
        let name = channel.name;
        return this.getMeta(kind, where, name);
    }

    getSchemaByChannel(channel) {
        let kind = channel.device.kind;
        let where = channel.channelType;
        let name = channel.name;
        return this.getSchema(kind, where, name);
    }

    getMemorySchema(table, principal, getMeta = false) {
        return this._memoryClient.getSchema(table, principal);
    }

    createMemorySchema(table, args, types) {
        return this._memoryClient.createTable(table, args, types);
    }
};
