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

const request = require('request-promise-native');
const fs = require('fs');
const util = require('util');
const readFile = util.promisify(fs.readFile);

const getSDP = (path, nmos = true) => {
  return (path.startsWith('http')) ?
    request({
      url: path,
      resolveWithFullResponse: true
    }).then(res => {
      if (!res.headers['content-type'].startsWith('application/sdp')) {
        return Promise.reject(new Error(
          `Media type (MIME type/Content-Type) of SDP file is '${res.headers['content-type']}' and not signalled as 'applicatio/sdp' as required in RFC 4566 Section 5.`));
      } else {
        return (nmos && !path.endsWith('.sdp')) ?
          Promise.reject(new Error(
            `Resource name of SDP file '${path.split('/').slice(-1)[0]}' does not end in '.sdp' as required by NMOS Section 2.3.`)) :
          Promise.resolve(res.body);
      }
    }, e => Promise.reject(e)) :
    readFile(path, 'utf8');
};

const badEndings = /[^\r]\n|\r[^\n]/;
const linePattern = /^[a-z]=\S.*$/;
const letterCheck = /^[vosiuepcbzkatrm].*$/;
// const spaceCheck = /\s\s/;
const mustHaves = [ 'v', 'o', 's', 't' ];
const followedBy = {
  session : {
    'v': { 'o': 'session' },
    'o': { 's': 'session' },
    's': { 'i': 'session', 'u': 'session', 'e': 'session', 'p': 'session',
      'c': 'session', 'b': 'session', 't': 'time' },
    'i': { 'i': 'session', 'u': 'session', 'e': 'session', 'p': 'session',
      'c': 'session', 'b': 'session', 't': 'time' },
    'u': { 'u': 'session', 'e': 'session', 'p': 'session',
      'c': 'session', 'b': 'session', 't': 'time' },
    'e': { 'e': 'session', 'p': 'session',
      'c': 'session', 'b': 'session', 't': 'time' },
    'p': { 'p': 'session',
      'c': 'session', 'b': 'session', 't': 'time' },
    'c': { 'c': 'session', 'b': 'session', 't': 'time' },
    'b': { 'b': 'session', 't': 'time' },
    'z': { 'z': 'session', 'k' : 'session',
      'a': 'session', 'm': 'media' },
    'k': { 'k' : 'session',
      'a': 'session', 'm': 'media' },
    'a': { 'a': 'session', 'm': 'media' },
  },
  time : {
    't': { 'r': 'time', 't': 'time', 'z': 'session', 'k' : 'session',
      'a': 'session', 'm': 'media' },
    'r': { 'r': 'time', 't': 'time', 'z': 'session', 'k' : 'session',
      'a': 'session', 'm': 'media' }
  },
  media : {
    'm': { 'i': 'media', 'c': 'media', 'b': 'media', 'k': 'media', 'a': 'media',
      'm': 'media' },
    'i': { 'i': 'media', 'c': 'media', 'b': 'media', 'k': 'media', 'a': 'media',
      'm' : 'media' },
    'c': { 'c': 'media', 'b': 'media', 'k': 'media', 'a': 'media',
      'm' : 'media' },
    'b': { 'b': 'media', 'k': 'media', 'a': 'media',
      'm' : 'media' },
    'k': { 'k': 'media', 'a': 'media',
      'm' : 'media' },
    'a': { 'a': 'media', 'm' : 'media' }
  }
};

const checkRFC = (sdp, checkEndings = false) => {
  // Test 0 - check if line endings are all CRLF
  let errors = [];
  if (checkEndings && badEndings.test(sdp)) {
    errors.push('SDP file contains record ending characters 0x0a and 0x0d separately from the expected CRLF pattern, as per RFC 4566 Section 5.');
  }

  let lines = sdp.match(/[^\r\n]+/g);

  // Test 1 - check each line is an acceptable format - no blank lines
  for ( let x = 0 ; x < lines.length ; x++ ) {
    if (!linePattern.test(lines[x])) {
      errors.push(new Error(
        `Line ${x + 1}: Every line of an SDP file must be of the form '<type>=<value>' with <type> being one character and no whitespace either side of the equals, as per RFC 4566 Section 5.`));
    }
  }

  // Test 2 - check the only letters in use are defined in RFC 4566
  for ( let x = 0 ; x < lines.length ; x++ ) {
    if (!letterCheck.test(lines[x])) {
      errors.push(new Error(
        `Line ${x + 1}: Every line of an SDP file must start with a permitted type letter or the line must be ignored, as per RFC 4566 Section 5.`));
    }
  }

  // Test 3 - first line must be v=0
  if (!lines[0].startsWith('v=0')) {
    errors.push(new Error('Line 1: The first line must be \'v=0\' as per RFC 4566 Section 5.1.'));
  }

  let types = lines.map(x => x.slice(0, 1));
  // Test 4 - Check for mandatory types
  for ( let x of mustHaves ) {
    if (types.indexOf(x) < 0) {
      errors.push(new Error(`An SDP file must have at least one record of type ${x} as per RFC 4566 Section 5.1.`));
    }
  }

  // Test 5 - check the order of the parameters
  let state = 'session';
  let nextState = {};
  for ( let x = 1 ; x < types.length ; x++ ) {
    let movingOn = followedBy[state][types[x - 1]];
    nextState = movingOn ? movingOn : nextState;
    if (Object.keys(nextState).indexOf(types[x]) < 0) {
      errors.push(new Error(`Line ${x + 1}: SDP type '${types[x - 1]}' cannot be followed by type '${types[x]}', as per the fixed order or RFC 4566 Section 5.`));
    } else {
      state = nextState[types[x]];
    }
  }

  // Test 6 - check no values contain the Nul character
  for ( let x = 0 ; x < lines.length ; x++ ) {
    if (lines.slice(2).indexOf('\u0000') >= 0) {
      errors.push(new Error(`Line ${x + 1}: Value contains illegal Nul (0x00) character not permitted by RFC 4566 Section 5.`));
    }
  }
  return errors;
};

module.exports = {
  getSDP,
  checkRFC
};
