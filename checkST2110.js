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

// const splitLines = sdp => sdp.match(/[^\r\n]+/g);
const concat = arrays => Array.prototype.concat.apply([], arrays);

const mediaclkPattern = /m=[\s\S]+a=mediaclk/;
const mediaclkDirectPattern = /a=mediaclk[^\s=]+/g;

// Test ST2110-10 Section 8.1 Test 1 - Shell have media-level mediaclk
const test_10_81_1 = sdp => {
  let errors = [];
  if (!mediaclkPattern.test(sdp)) {
    errors.push(new Error('Stream description shall have a media-level \'mediaclk\' attribute, as per SMPTE ST 2110-10 Section 8.1'));
  }
  return errors;
};

// Test ST2110-10 Section 8.1 Test 2 - Should have mediaclk using direct reference
const test_10_81_2 = (sdp, params) => {
  if (!params.should) return;
  let errors = [];
  let directCheck = sdp.match(mediaclkDirectPattern);
  if (Array.isArray(directCheck) && directCheck.length > 0) {
    directCheck = directCheck.filter(x => !x.startsWith('a=mediaclk:direct'));
    errors.concat.apply(errors, directCheck.map(nd =>
      new Error(`The 'direct' reference for the mediaclk paramter should be used, as per SMPTE ST 2110-10 Section 8.1. Found '${nd}'.`)));
  }
  return errors;
};

const section_10_81 = (sdp, params) => {
  let tests = [ test_10_81_1, test_10_81_2 ];
  console.log('>>>', concat(tests.map(t => t(sdp, params))));
  return [];
};

const allSections = (sdp, params) => {
  let errors = [];
  let sections = [ section_10_81 ];
  return errors.concat.apply(errors, sections.map(s => s(sdp, params)));
};

module.exports = {
  allSections
};
