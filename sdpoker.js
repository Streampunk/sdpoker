#!/usr/bin/env node
/* Copyright 2018 Streampunk Media Ltd.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

const { getSDP, checkRFC4566, checkST2110 } = require('./index.js');
const yargs = require('yargs');
const { accessSync, R_OK } = require('fs');

const args = yargs
  .help('help')
  .default('nmos', true)
  .default('checkEndings', false)
  .default('should', false)
  .default('noCopy', true)
  .default('duplicate', false)
  .default('videoOnly', false)
  .boolean([ 'nmos', 'checkEndings', 'should', 'noCopy', 'duplicate',
    'videoOnly' ])
  .usage('Check an SDP file for conformance with RFC4566 and SMPTE ST 2110.\n' +
    'Usage: $0 [options] <sdp_file or HTTP URL>')
  .describe('nmos', 'Check for compliance with NMOS rules.')
  .describe('checkEndings', 'Check line endings are CRLF, no other CR/LF.')
  .describe('should', 'As well as shall, also check all should clauses.')
  .describe('noCopy', 'Fail obvious copies of the ST 2110-10 SDP example')
  .describe('duplicate', 'Expect duplicate streams.')
  .describe('videoOnly', 'Describes only SMPTE ST 2110-20 streams.')
  .check(argv => {
    if (!argv._[0].startsWith('http')) {
      accessSync(argv._[0], R_OK);
    }
    return true;
  })
  .argv;

console.log(args);

async function test (args) {
  try {
    let sdp = await getSDP(args._[0], args.nmos);
    let rfcErrors = checkRFC4566(sdp, args);
    let st2110Errors = checkST2110(sdp, args);
    let errors = rfcErrors.concat(st2110Errors);
    if (errors.length !== 0) {
      console.error(errors.map(e => e.message));
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (e) {
    console.error(e);
  }
}

test(args);
