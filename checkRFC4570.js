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

const splitLines = sdp => sdp.match(/[^\r\n]+/g);
const concat = arrays => Array.prototype.concat.apply([], arrays);

const sourceFilterPattern = /a=source-filter:\s(incl|excl)\sIN\s(IP4|IP6|\*)\s(\S+)(?:\s(\S+))+/;
const cPattern = /^c=IN\s+(IP[46])\s+([^\s/]+)(\/\d+)?(\/[1-9]\d*)?$/;
const multiPattern = /^((22[4-9]|23[0-9])(\.(\d\d?\d?)){3})|(ff[0-7][123458e]::[^\s]+)$/;

// Section 3 Test 1 - Source-filter correctly formatted if present
const test_30_1 = sdp => {
  let lines = splitLines(sdp);
  let errors = [];
  for ( let x = 0 ; x < lines.length ; x++ ) {
    if (lines[x].startsWith('a=source-filter:')) {
      let sourceFilterMatch = lines[x].match(sourceFilterPattern);
      if (!sourceFilterMatch) {
        errors.push(new Error(`Line ${x + 1}: Source-filters must follow the pattern 'a=source-filter: <filter-mode> <filter-spec>' as per RFC 4570 Section 3.`));
        continue;
      }
    }
  }
  return errors;
};

// Section 3 Test 2 - Source-filters are present when multicast addresses are used
const test_30_2 = sdp => {
  let lines = splitLines(sdp);
  let errors = [];
  let isMulticast = false;
  let seenSourceFilter = false;
  for ( let x = 0 ; x < lines.length ; x++ ) {
    if (lines[x].startsWith('c=')) {
      let addrMatch = lines[x].match(cPattern);
      if (!addrMatch) {
        continue;
      }
      if (multiPattern.test(addrMatch[2])) {
        isMulticast = true;
      }
    }
    if (lines[x].startsWith('a=source-filter:')) {
      seenSourceFilter = true;
    }
  }
  if (isMulticast && !seenSourceFilter) {
    // A basic check that at least one source-filter is included when using a multicast destination
    errors.push(new Error('SDP file includes one or more multicast destinations but does not include any a=source-filter lines as per RFC 4570 Section 3.'));
  }
  return errors;
};

// Section 3.0 Test 3 - Source-filters match addresses used in connection attributes
const test_30_3 = sdp => {
  let lines = splitLines(sdp);
  let errors = [];
  let globalAddr = null;
  let mediaAddr = null;
  let inMedia = false;
  for ( let x = 0 ; x < lines.length ; x++ ) {
    if (lines[x].startsWith('c=')) {
      let addrMatch = lines[x].match(cPattern);
      if (!addrMatch) {
        continue;
      }
      if (!inMedia) {
        globalAddr = addrMatch[2];
      } else {
        mediaAddr = addrMatch[2];
      }
    }
    if (lines[x].startsWith('m=')) {
      inMedia = true;
      mediaAddr = null;
    }
    if (lines[x].startsWith('a=source-filter:')) {
      let sourceFilterMatch = lines[x].match(sourceFilterPattern);
      if (!sourceFilterMatch) {
        continue;
      }
      if (sourceFilterMatch[3] != globalAddr && sourceFilterMatch[3] != mediaAddr && sourceFilterMatch[3] != '*') {
        errors.push(new Error(`Line ${x + 1}: Source-filter destination addresses must match one or more connection address as per RFC 4570 Section 3.`));
      }
    }
  }
  return errors;
};

const section_30 = (sdp, params) => {
  let tests = [ test_30_1, test_30_2, test_30_3 ];
  return concat(tests.map(t => t(sdp, params)));
};

const allSections = (sdp, params) => {
  let sections = [ section_30 ];
  return concat(sections.map(s => s(sdp, params)));
};

module.exports = {
  allSections,
  section_30
};
