// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2017-2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');

const AppGrammar = require('../lib/grammar_api');
const SchemaRetriever = require('../lib/schema');
const { prettyprint } = require('../lib/prettyprint');
const Generate = require('../lib/generate');

const ThingpediaClientHttp = require('./http_client');
const _mockMemoryClient = require('./mock_memory_client');

const TEST_CASES = [
    // first test that factoring local programs has no effect
    ['factor', 'now => @security-camera.current_event() => notify;',
    `now => @security-camera.current_event() => notify;`, []],
    ['factor', 'now => @com.bing.web_search(query="lol") => notify;',
    `now => @com.bing.web_search(query="lol") => notify;`, []],

    ['factor', 'monitor (@security-camera.current_event()) => notify;',
    `monitor (@security-camera.current_event()) => notify;`, []],

    ['factor', 'now => @security-camera.set_power(power=enum(on));',
    `now => @security-camera.set_power(power=enum(on));`, []],
    ['factor', 'monitor (@security-camera.current_event()) => @security-camera.set_power(power=enum(on));',
    `monitor (@security-camera.current_event()) => @security-camera.set_power(power=enum(on));`, []],

    ['factor', 'monitor (@security-camera.current_event()) join @com.bing.web_search(query="lol") => notify;',
    `(monitor (@security-camera.current_event()) join @com.bing.web_search(query="lol")) => notify;`, []],

    // then test lowerings
    ['lower', 'now => @security-camera.current_event() => return;',
    'now => @security-camera.current_event() => notify;', []],

    ['lower', `executor = "1234"^^tt:contact : now => @security-camera.current_event() => return;`,
`executor = "1234"^^tt:contact : {
    class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {
        action send (in req __principal : Entity(tt:contact), in req __program_id : Entity(tt:program_id), in req __flow : Number, in req __kindChannel : Entity(tt:function), in req start_time : Date, in req has_sound : Boolean, in req has_motion : Boolean, in req has_person : Boolean, in req picture_url : Entity(tt:picture));
    }
    now => @security-camera.current_event() => @__dyn_0.send(__principal="mock-account:12345678"^^tt:contact("me"), __program_id=$event.program_id, __flow=0, __kindChannel=$event.type, start_time=start_time, has_sound=has_sound, has_motion=has_motion, has_person=has_person, picture_url=picture_url);
}`,
[`{
    class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {
        query receive (in req __principal : Entity(tt:contact), in req __program_id : Entity(tt:program_id), in req __flow : Number, out __kindChannel : Entity(tt:function), out start_time : Date, out has_sound : Boolean, out has_motion : Boolean, out has_person : Boolean, out picture_url : Entity(tt:picture));
    }
    monitor (@__dyn_0.receive(__principal="1234"^^tt:contact, __program_id=$event.program_id, __flow=0)) => notify;
}`]],

    ['lower', `executor = "1234"^^tt:contact : now => @com.bing.web_search(query="lol") => return;`,
`executor = "1234"^^tt:contact : {
    class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {
        action send (in req __principal : Entity(tt:contact), in req __program_id : Entity(tt:program_id), in req __flow : Number, in req __kindChannel : Entity(tt:function), in req title : String, in req description : String, in req link : Entity(tt:url));
    }
    now => @com.bing.web_search(query="lol") => @__dyn_0.send(__principal="mock-account:12345678"^^tt:contact("me"), __program_id=$event.program_id, __flow=0, __kindChannel=$event.type, title=title, description=description, link=link);
}`,
[`{
    class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {
        query receive (in req __principal : Entity(tt:contact), in req __program_id : Entity(tt:program_id), in req __flow : Number, out __kindChannel : Entity(tt:function), out title : String, out description : String, out link : Entity(tt:url));
    }
    monitor (@__dyn_0.receive(__principal="1234"^^tt:contact, __program_id=$event.program_id, __flow=0)) => notify;
}`]],

    ['lower', `executor = "1234"^^tt:contact : monitor @security-camera.current_event() => return;`,
`executor = "1234"^^tt:contact : {
    class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {
        action send (in req __principal : Entity(tt:contact), in req __program_id : Entity(tt:program_id), in req __flow : Number, in req __kindChannel : Entity(tt:function), in req start_time : Date, in req has_sound : Boolean, in req has_motion : Boolean, in req has_person : Boolean, in req picture_url : Entity(tt:picture));
    }
    monitor (@security-camera.current_event()) => @__dyn_0.send(__principal="mock-account:12345678"^^tt:contact("me"), __program_id=$event.program_id, __flow=0, __kindChannel=$event.type, start_time=start_time, has_sound=has_sound, has_motion=has_motion, has_person=has_person, picture_url=picture_url);
}`,
[`{
    class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {
        query receive (in req __principal : Entity(tt:contact), in req __program_id : Entity(tt:program_id), in req __flow : Number, out __kindChannel : Entity(tt:function), out start_time : Date, out has_sound : Boolean, out has_motion : Boolean, out has_person : Boolean, out picture_url : Entity(tt:picture));
    }
    monitor (@__dyn_0.receive(__principal="1234"^^tt:contact, __program_id=$event.program_id, __flow=0)) => notify;
}`]],

    // now test factoring
    ['factor', 'monitor @security-camera(principal="1234"^^tt:contact).current_event() => notify;',
`{
    class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {
        query receive (in req __principal : Entity(tt:contact), in req __program_id : Entity(tt:program_id), in req __flow : Number, out __kindChannel : Entity(tt:function), out start_time : Date, out has_sound : Boolean, out has_motion : Boolean, out has_person : Boolean, out picture_url : Entity(tt:picture));
    }
    monitor (@__dyn_0.receive(__principal="1234"^^tt:contact, __program_id=$event.program_id, __flow=0)) => notify;
}`,
[`executor = "1234"^^tt:contact : {
    class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {
        action send (in req __principal : Entity(tt:contact), in req __program_id : Entity(tt:program_id), in req __flow : Number, in req __kindChannel : Entity(tt:function), in req start_time : Date, in req has_sound : Boolean, in req has_motion : Boolean, in req has_person : Boolean, in req picture_url : Entity(tt:picture));
    }
    monitor (@security-camera.current_event()) => @__dyn_0.send(__principal="mock-account:12345678"^^tt:contact("me"), __program_id=$event.program_id, __flow=0, __kindChannel=$event.type, start_time=start_time, has_sound=has_sound, has_motion=has_motion, has_person=has_person, picture_url=picture_url);
}`]
],

    // FIXME remote tables
    /*
    ['factor', 'now => @security-camera(principal="1234"^^tt:contact).current_event() => notify;',
`{
    class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {
        query receive (in req __principal : Entity(tt:contact_group), in req __program_id : Entity(tt:program_id), in req __flow : Number, out __kindChannel : Entity(tt:function), out picture_url : Entity(tt:picture));
    }
    monitor @__dyn_0.receive(__principal=["1234"^^tt:contact], __program_id=$event.program_id, __flow=1)  => notify;
}`,
[`executor = "1234"^^tt:contact : AlmondGenerated() {
    class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {
        action send (in req __principal : Entity(tt:contact_group), in req __program_id : Entity(tt:program_id), in req __flow : Number, in req __kindChannel : Entity(tt:function), in opt picture_url : Entity(tt:picture));
    }
    now => @security-camera.get_snapshot()  => @__dyn_0.send(__principal=["mock-account:12345678"^^tt:contact("me")], __program_id=$event.program_id, __flow=1, __kindChannel=$event.type) ;
}`]],*/

    // FIXME remote actions
    /*
    ['factor', 'now => @security-camera(principal="1234"^^tt:contact).set_power(power=enum(on));',
     'null', ['executor = "1234"^^tt:contact :     now => @security-camera.set_power(power=enum(on)) ;']],

    ['factor', 'timer(base=makeDate(), interval=10s) => @security-camera(principal="1234"^^tt:contact).set_power(power=enum(on));',
`Main() {
    class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {
        action send (in req __principal : Entity(tt:contact_group), in req __program_id : Entity(tt:program_id), in req __flow : Number, in req __kindChannel : Entity(tt:function), in opt interval : Measure(ms));
    }
    timer(base=makeDate(), interval=10s) => @__dyn_0.send(__principal=["1234"^^tt:contact], __program_id=$event.program_id, __flow=0, __kindChannel=$event.type, interval=10s) ;
}`,
[`executor = "1234"^^tt:contact : {
    class @__dyn_0 extends @org.thingpedia.builtin.thingengine.remote {
        query receive (in req __principal : Entity(tt:contact_group), in req __program_id : Entity(tt:program_id), in req __flow : Number, out __kindChannel : Entity(tt:function), out interval : Measure(ms));
    }
    @__dyn_0.receive(__principal=["mock-account:12345678"^^tt:contact("me")], __program_id=$event.program_id, __flow=0)  => @security-camera.set_power(power=enum(on)) ;
}`]],*/

];

//var schemaRetriever = new SchemaRetriever(_mockSchemaDelegate, _mockMemoryClient, true);
var schemaRetriever = new SchemaRetriever(new ThingpediaClientHttp(), _mockMemoryClient, true);
var _mockMessaging = {
    type: 'mock',
    account: '12345678'
};

function safePrettyprint(prog) {
    if (prog === undefined)
        return 'undefined';
    if (prog === null)
        return 'null';
    return prettyprint(prog, true).replace(/__token="[^"]+"/g, `__token="XXXXXXXX"`).trim();
}

function test(i) {
    console.log('Test Case #' + (i+1));
    let [type, testCase, expectedLowered, expectedSend] = TEST_CASES[i];

    return AppGrammar.parseAndTypecheck(testCase, schemaRetriever).then((prog) => {
        let newprogram, sendprograms;
        if (type === 'factor') {
            [newprogram, sendprograms] = Generate.factorProgram(_mockMessaging, prog);
        } else {
            newprogram = prog;
            sendprograms = Generate.lowerReturn(_mockMessaging, prog);
        }

        newprogram = safePrettyprint(newprogram);
        AppGrammar.parse(newprogram);
        if (newprogram !== expectedLowered) {
            console.error('Test Case #' + (i+1) + ': lowered program does not match what expected');
            console.error('Expected: ' + expectedLowered);
            console.error('Generated: ' + newprogram);
        }

        for (let j = 0; j < Math.max(sendprograms.length, expectedSend.length); j++) {
            let tt = safePrettyprint(sendprograms[j]);
            AppGrammar.parse(tt);
            let expectedTT = expectedSend[j] || 'undefined';
            if (tt !== expectedTT) {
                console.error('Test Case #' + (i+1) + ': program to send does not match what expected');
                console.error('Expected: ' + expectedTT);
                console.error('Generated: ' + tt);
            }
        }
    }).catch((e) => {
        console.error('Test Case #' + (i+1) + ': failed with exception');
        console.error('Error: ' + e.message);
        console.error(e.stack);
        if (process.env.TEST_MODE)
            throw e;
    });
}

function loop(i) {
    if (i === TEST_CASES.length)
        return Q();

    return Q(test(i)).then(() => loop(i+1));
}

loop(0).done();

