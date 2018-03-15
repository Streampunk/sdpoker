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

const mediaclkPattern = /[\r\n]a=mediaclk/;
const mediaclkDirectPattern = /a=mediaclk[^\s=]+/g;
const tsrefclkPattern = /[\r\n]a=ts-refclk/;
const ptpPattern = /(([0-9a-fA-F]{2}-){7}[0-9a-fA-F]{2})(:(\d+|domain-name=\S+))?/;
const macPattern = /(([0-9a-fA-F]{2}-){5}[0-9a-fA-F]{2})/;
const dupPattern = /m=[\s\S]+a=ssrc-group:DUP|a=group:DUP[\s\S]+m=/;
const ssrcGroupPattern = /a=ssrc-group:DUP\s+(\d+)\s+(\d+)/;
const groupPattern = /a=group:DUP\s+(\S+)\s+(\S+)/;
const ssrcPattern = /a=ssrc:(\d+)\s/;

const specExample = `v=0
o=- 123456 11 IN IP4 192.168.100.2
s=Example of a SMPTE ST2110-20 signal
i=this example is for 720p video at 59.94
t=0 0
a=recvonly
a=group:DUP primary secondary
m=video 50000 RTP/AVP 112
c=IN IP4 239.100.9.10/32
a=source-filter:incl IN IP4 239.100.9.10 192.168.100.2
a=rtpmap:112 raw/90000
a=fmtp:112 sampling=YCbCr-4:2:2; width=1280; height=720; exactframerate=60000/1001; depth=10; TCS=SDR; colorimetry=BT709; PM=2110GPM; SSN=ST2110-20:2017;
a=ts-refclk:ptp=IEEE1588-2008:39-A7-94-FF-FE-07-CB-D0:37
a=mediaclk:direct=0
a=mid:primary
m=video 50020 RTP/AVP 112
c=IN IP4 239.101.9.10/32
a=source-filter:incl IN IP4 239.101.9.10 192.168.101.2
a=rtpmap:112 raw/90000
a=fmtp:112 sampling=YCbCr-4:2:2; width=1280; height=720; exactframerate=60000/1001; depth=10; TCS=SDR; colorimetry=BT709; PM=2110GPM; SSN=ST2110-20:2017;
a=ts-refclk:ptp=IEEE1588-2008:39-A7-94-FF-FE-07-CB-D0:37
a=mediaclk:direct=0
a=mid:secondary`;

// Test ST2110-10 Section 8.1 Test 1 - Shell have media-level mediaclk per stream
const test_10_81_1 = sdp => {
  let errors = [];
  let streams = sdp.split(/[\r\n]m=/).slice(1);
  for ( let x = 0 ; x < streams.length ; x++ ) {
    if (!mediaclkPattern.test(sdp)) {
      errors.push(new Error(`Stream ${x + 1}: Each stream description shall have a media-level 'mediaclk' attribute, as per SMPTE ST 2110-10 Section 8.1.`));
    }
  }
  return errors;
};

// Test ST2110-10 Section 8.1 Test 2 - Should have mediaclk using direct reference
const test_10_81_2 = (sdp, params) => {
  if (!params.should) return [];
  let directCheck = sdp.match(mediaclkDirectPattern);
  if (Array.isArray(directCheck) && directCheck.length > 0) {
    directCheck = directCheck.filter(x => !x.startsWith('a=mediaclk:direct'));
    return concat(directCheck.map(nd =>
      new Error(`The 'direct' reference for the mediaclk paramter should be used, as per SMPTE ST 2110-10 Section 8.1. Found '${nd}'.`)));
  } else {
    return [];
  }
};

// TODO check that the media clk complies with RFC7273 Section 5.2

// Test ST2110-10 Section 8.1 Test 1 - Shall have a media-level ts-refclk
const test_10_82_1 = sdp => {
  let errors = [];
  let streams = sdp.split(/[\r\n]m=/).slice(1);
  for ( let x = 0 ; x < streams.length ; x++ ) {
    if (!tsrefclkPattern.test(sdp)) {
      errors.push(new Error(`Stream ${x + 1}: Stream descriptions shall have a media-level 'ts-refclk' attribute, as per SMPTE ST 2110-10 Section 8.2.`));
    }
  }
  return errors;
};

// Test ST2110-10 Section 8.2 Test 2 - Shall be ptp reference or shall be localmac
const test_10_82_2 = sdp => {
  let errors = [];
  let lines = splitLines(sdp);
  let mediaLevel = false;
  for ( let x = 0 ; x < lines.length ; x++ ) {
    if (!mediaLevel) {
      if (lines[x].startsWith('m=')) {
        mediaLevel = true;
      }
      continue;
    }
    if (lines[x].startsWith('a=ts-refclk')) {
      if (!lines[x].startsWith('a=ts-refclk:ptp=') &&
        !lines[x].startsWith('a=ts-refclk:localmac')) {
        errors.push(
          new Error(`Line ${x + 1}: Reference clocks shall use the PTP form or shall use the localmac form, as per SMPTE ST 2110-10 Section 8.2.`));
      }
    }
  }
  return errors;
};

// Test ST2110-10 Section 8.2 Test 3 - If a PTP reference clock, check parameters
const test_10_82_3 = sdp => {
  let errors = [];
  let lines = splitLines(sdp);
  let mediaLevel = false;
  for ( let x = 0 ; x < lines.length ; x++ ) {
    if (!mediaLevel) {
      if (lines[x].startsWith('m=')) {
        mediaLevel = true;
      }
      continue;
    }
    if (lines[x].startsWith('a=ts-refclk:ptp=')) {
      let ptpDetails = lines[x].slice(16);
      if (ptpDetails.startsWith('traceable')) {
        continue; // acceptable form
      }
      if (!ptpDetails.startsWith('IEEE1588-2008:')) {
        errors.push(new Error(`Line ${x + 1}: The only supported PTP versions are 'IEEE1588-2008' and 'traceable', as per SMPTE ST 2110-10 Section 8.2.`));
        continue;
      }
      if (!ptpPattern.test(ptpDetails.slice(14))) {
        errors.push(new Error(`Line ${x + 1}: RFC 7273 PTP reference clock attribute parameters for 'ptp-server' do not match accpetable patterns.`));
        continue;
      }
      let ptpMatch = ptpDetails.slice(14).match(ptpPattern);
      if (!ptpMatch[4] && ptpDetails.endsWith(':')) {
        errors.push(new Error(`Line ${x + 1}: Where no PTP domain is specified, 'ptp-version' cannot end with a ':', as per RFC 7273 Section 4.8.`));
        continue;
      }
      if (ptpMatch[4]) {
        if (!ptpMatch[4].startsWith('domain-name=')) {
          let domainNmbr = +ptpMatch[4];
          if (domainNmbr < 0 || domainNmbr > 127) {
            errors.push(new Error(`Line ${x + 1}: PTP domain number must be a value between 0 and 127 inclusive, as per RFC 7273 Section 4.8.`));
          }
        }
      }
    }
  }
  return errors;
};

// Teest ST2110-10 Section 8.2 - If local mac clock, check MAC address
const test_10_82_4 = sdp => {
  let errors = [];
  let lines = splitLines(sdp);
  let mediaLevel = false;
  for ( let x = 0 ; x < lines.length ; x++ ) {
    if (!mediaLevel) {
      if (lines[x].startsWith('m=')) {
        mediaLevel = true;
      }
      continue;
    }
    if (lines[x].startsWith('a=ts-refclk:localmac=')) {
      let mac = lines[x].slice(21);
      if (!macPattern.test(mac)) {
        errors.push(new Error(`Line ${x + 1}: PTP reference clock of type 'localmac' has an invalid MAC address, as per SMPTE ST 2110-10 Section 8.2.`));
      }
    }
  }
  return errors;
};

// Test ST 2110-10 Section 8.3 Test 1 - Duplication expected, is it present?
const test_10_83_1 = (sdp, params) => {
  if (!params.duplicate) {
    return [];
  }
  return dupPattern.test(sdp) ? [] :
    [ new Error('Duplicate RTP streams are expected, but neither media-level \'ssrc-group:DUP\' or session-level \'group:DUP\' were found, to satisfy SMPTE ST 2110-10 Section 8.3.') ];
};

// Test ST 2110-10 Section 8.3 Test 2 - Separate source addresses - RFC 7104 section 4.1
const test_10_83_2 = sdp => {
  if (!sdp.match(/a=ssrc-group/)) { // Detect whether this test applies
    return [];
  }
  let lines = splitLines(sdp);
  let errors = [];
  let ssrcs = [ [] ];
  let streamCounter = 0;
  for ( let x = 0 ; x < lines.length ; x++ ) { // Order of ssrc and ssrc-group nor defined ...
    if (lines[x].startsWith('m=')) {
      streamCounter++;
      ssrcs.push([]);
    }
    if (lines[x].startsWith('a=ssrc:')) {
      let ssrcMatch = lines[x].match(ssrcPattern);
      if (!ssrcMatch) {
        errors.push(new Error(`Line ${x + 1}: Found an SSRC line with group reference to a non-integer value, which is noe possible according to RFC 7104.`));
        continue;
      }
      ssrcs[streamCounter].push(+ssrcMatch[1]);
    }
  }
  streamCounter = 0;
  for ( let x = 0 ; x < lines.length ; x++ ) { // .. so iterate twice
    if (lines[x].startsWith('m=')) {
      streamCounter++;
    }
    if (!lines[x].startsWith('a=ssrc-group') || (streamCounter === 0)) {
      continue;
    }
    let groupMatch = lines[x].match(ssrcGroupPattern);
    if (!groupMatch) {
      errors.push(new Error(`Line ${x + 1}: Separate source address grouping is not an acceptable pattern, with reference to RFC 7104.`));
      continue;
    }
    for ( let groupID of groupMatch.slice(1, 3)) {
      if (ssrcs[streamCounter].indexOf(+groupID) < 0) {
        errors.push(new Error(`Line ${x + 1}: Reference to non existant source-level attribute ${groupID} within stream ${streamCounter}.`));
      }
    }
  }
  // TODO check the source-filter lines have one Mcast address and 2 IP addresses
  return errors;
};

// Test ST 2110-10 Section 8.3 Test 3 - Separate destination addresses - RFC 7104 Section 4.2
const test_10_83_3 = sdp => {
  if (!sdp.match(/a=group/)) {
    return [];
  }
  let lines = splitLines(sdp);
  let errors = [];
  let mids = [];
  let streamCounter = 0;
  for ( let x = 0 ; x < lines.length ; x++ ) {
    if (lines[x].startsWith('m=')) {
      if (!mids[streamCounter++]) { mids.push(''); }
    }
    if (lines[x].startsWith('a=mid:')) {
      let mid = lines[x].slice(6);
      if (mids.indexOf(mid) >= 0) {
        errors.push(new Error(`Line ${x + 1}: Duplicate media identification '${mid}' found which is not permitted by RFC 5888 Section 4.'`));
        continue;
      }
      if (mids[streamCounter]) {
        errors.push(new Error(`Line ${x + 1}: One stream with two media identifiers '${mid}' and '${mids[streamCounter]}'.`));
        continue;
      }
      mids.push(mid);
    }
  }
  let doneOne = false;
  for ( let x = 0 ; x < lines.length ; x++ ) {
    if (lines[x].startsWith('m=')) {
      if (!doneOne) {
        errors.push(new Error(`Got to line ${x + 1}, the end of session-level description, without finding the destination group, with reference to RFC 7104.`));
      }
      break;
    }
    if (!lines[x].startsWith('a=group')) {
      continue;
    }
    let groupMatch = lines[x].match(groupPattern);
    if (!groupMatch) {
      errors.push(new Error(`Line ${x + 1}: Separate destination address grouping is not an acceptable pattern, with reference to RFC 7104.`));
      continue;
    }
    doneOne = true;
    for ( let groupId of groupMatch.slice(1, 3) ) {
      if (mids.indexOf(groupId) < 0) {
        errors.push(new Error(`Line ${x + 1}: Separate destination group reference '${groupId}' with no associated stream, with reference to RFC 7104.`));
      }
    }
  }
  return errors;
};

const section_10_81 = (sdp, params) => {
  let tests = [ test_10_81_1, test_10_81_2 ];
  return concat(tests.map(t => t(sdp, params)));
};

const section_10_82 = (sdp, params) => {
  let tests = [ test_10_82_1, test_10_82_2, test_10_82_3, test_10_82_4 ];
  return concat(tests.map(t => t(sdp, params)));
};

const section_10_83 = (sdp, params) => {
  let tests = [ test_10_83_1, test_10_83_2, test_10_83_3 ];
  return concat(tests.map(t => t(sdp, params)));
};

// Test ST2110-10 Appendix B Test 1 - Check that the SDP file given is not a straight copy
const no_copy = sdp => {
  let lines = splitLines(sdp.trim());
  let exlines = splitLines(specExample);
  let length = lines.length < exlines.length ? lines.length : exlines.length;
  let matching = true;
  for ( let x = 0 ; x < length ; x++ ) {
    if (!lines[x].replace(/\s+/g, ' ').startsWith(exlines[x])) {
      matching = false;
      break;
    }
  }
  return matching ? [ new Error(
    'SDP file given is a fairly obvious copy of the example in the standard.')] :
    [];
};

const allSections = (sdp, params) => {
  let sections = [ section_10_81, section_10_82, section_10_83 ];
  if (params.noCopy) {
    sections.push(no_copy);
  }
  return concat(sections.map(s => s(sdp, params)));
};

module.exports = {
  allSections
};
