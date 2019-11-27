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

const sourceFilterPattern = /a=source-filter:\s(incl|excl)/;

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

const section_30 = (sdp, params) => {
  let tests = [ test_30_1 ];
  return concat(tests.map(t => t(sdp, params)));
};

const allSections = (sdp, params) => {
  let sections = [
    section_30  ];
  return concat(sections.map(s => s(sdp, params)));
};

module.exports = {
  allSections,
  section_30,
};
