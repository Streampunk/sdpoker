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

const concat = arrays => Array.prototype.concat.apply([], arrays);

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

// Section 5 Test 1 - check if line endings are all CRLF
const test50_1 = sdp => {
  let errors = [];
  if (badEndings.test(sdp)) {
    errors.push('SDP file contains record ending characters 0x0a and 0x0d separately from the expected CRLF pattern, as per RFC 4566 Section 5.');
  }
  return errors;
};

const splitLines = sdp => sdp.match(/[^\r\n]+/g);

// Section 5 Test 2 - check each line is an acceptable format - no blank lines
const test50_2 = lines => {
  let errors = [];
  for ( let x = 0 ; x < lines.length ; x++ ) {
    if (!linePattern.test(lines[x])) {
      errors.push(new Error(
        `Line ${x + 1}: Every line of an SDP file must be of the form '<type>=<value>' with <type> being one character and no whitespace either side of the equals, as per RFC 4566 Section 5.`));
    }
  }
  return errors;
};

// Section 5 Test 3 - check the only letters in use as types are defined in RFC 4566
const test50_3 = lines => {
  let errors = [];
  for ( let x = 0 ; x < lines.length ; x++ ) {
    if (!letterCheck.test(lines[x])) {
      errors.push(new Error(
        `Line ${x + 1}: Every line of an SDP file must start with a permitted type letter or the line must be ignored, as per RFC 4566 Section 5.`));
    }
  }
  return errors;
};

// Section 5 Test 4 - Check for mandatory types
const test50_4 = lines => {
  let errors = [];
  let types = lines.map(x => x.slice(0, 1));
  for ( let x of mustHaves ) {
    if (types.indexOf(x) < 0) {
      errors.push(new Error(`An SDP file must have at least one record of type ${x} as per RFC 4566 Section 5.1.`));
    }
  }
  return errors;
};

// Section 5 Test 5 - Check the order of the parameters
const test50_5 = lines => {
  let errors = [];
  let types = lines.map(x => x.slice(0, 1));
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
  return errors;
};

const test50_6 = lines => {
  let errors = [];
  // Test 6 - check no values contain the Nul character
  for ( let x = 0 ; x < lines.length ; x++ ) {
    if (lines.slice(2).indexOf('\u0000') >= 0) {
      errors.push(new Error(`Line ${x + 1}: Value contains illegal Nul (0x00) character not permitted by RFC 4566 Section 5.`));
    }
  }
  return errors;
};

// Section 5.1 Test 1 - first line must be v=0
const test51_1 = lines => {
  let errors = [];
  if (!lines[0].startsWith('v=0')) {
    errors.push(new Error('Line 1: The first line must be \'v=0\' as per RFC 4566 Section 5.1.'));
  }
  return errors;
};

const section50 = (sdp, params) => {
  let endTest = params.checkEndings ? test50_1(sdp, params.checkEndings) : [];
  // TODO decide whether to continue if line error endings are bad?
  let lines = splitLines(sdp);
  let mainTests = [ test50_2, test50_3, test50_4, test50_5, test50_6 ];
  return concat(mainTests.map(t => t(lines, params))).concat(endTest);
};

const section51 = (sdp, params) => {
  let lines = splitLines(sdp);
  return test51_1(lines, params);
};

const allSections = (sdp, params) => {
  let sections = [ section50, section51 ];
  return concat(sections.map(s => s(sdp, params)));
};

module.exports = {
  allSections,
  section50,
  section51
};
