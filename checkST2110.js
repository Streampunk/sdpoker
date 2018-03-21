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
const mediaclkDirectPattern = /[\r\n]a=mediaclk[^\s=]+/g;
const tsrefclkPattern = /[\r\n]a=ts-refclk/;
const ptpPattern = /(([0-9a-fA-F]{2}-){7}[0-9a-fA-F]{2})(:(\d+|domain-name=\S+))?/;
const macPattern = /(([0-9a-fA-F]{2}-){5}[0-9a-fA-F]{2})/;
const dupPattern = /[\r\n]m=[\s\S]+a=ssrc-group:DUP|^a=group:DUP[\s\S]+m=/;
const ssrcGroupPattern = /a=ssrc-group:DUP\s+(\d+)\s+(\d+)/;
const groupPattern = /a=group:DUP\s+(\S+)\s+(\S+)/;
const ssrcPattern = /a=ssrc:(\d+)\s/;
const videoPattern = /video\s+(\d+)(\/\d+)?\s+(RTP\/S?AVP)\s+(\d+)/;
const rtpmapPattern = /a=rtpmap:(\d+)\s(\S+)\/(\d+)\s*/;
const fmtpPattern = /a=fmtp:(\d+)(?:\s+([^\s=;]+)(?:=([^\s;]+))?;)*$/;
const fmtpParams = /([^\s=;]+(?:=[^\s;]+)?);/g;
const integerPattern = /^[1-9]\d*$/;
const frameRatePattern = /^([1-9]\d*)(?:\/([1-9]\d*))?$/;
const parPattern = /^([1-9]\d*):([1-9]\d*)$/;

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
  // TODO check the source-filter lines have one Mcast address and 2 IP addresses
  return errors;
};

// Test ST 2110-20 Section 7.1 Test 1 - If required, check all streams are video
const test_20_71_1 = (sdp, params) => {
  let streams = sdp.split(/[\r\n]m=/);
  let errors = [];
  if (params.videoOnly) {
    for ( let s = 1 ; s < streams.length ; s++ ) {
      if (!streams[s].startsWith('video')) {
        errors.push(new Error(`Stream ${s}: Media type is not 'video' and video only files are in test, as per SMPTE 2110-20 Section 7.1.`));
      }
    }
  }
  return errors;
};

// Test ST 2110-20 Section 7.1 Test 2 - For all video streams, check video params
const test_20_71_2 = sdp => {
  let errors = [];
  let lines = splitLines(sdp);
  for ( let x = 0 ; x < lines.length ; x++ ) {
    if (!lines[x].startsWith('m=video')) {
      continue;
    }
    let videoMatch = lines[x].match(videoPattern);
    if (!videoMatch) {
      errors.push(new Error(`Line ${x + 1}: Found a media description for video with a pattern that is not acceptable.`));
      continue;
    }
    // Check port number - SMPTE 2110-10 Section 6.2 says shall be UDP, so assume 0-65535
    let port = +videoMatch[1];
    if (isNaN(port) || port < 0 || port > 65535) {
      errors.push(new Error(`Line ${x + 1}: RTP video stream description with invalid port '${port}', with reference to ST 2110-10 Section 6.2 'shall use UDP'.`));
    }
    // Check RTP type - SMPTE 2110-10 Section 6.2 says shall be RTP, no allowance for SRTP
    if (videoMatch[3] === 'RTP/SAVP') {
      errors.push(new Error(`Line ${x + 1}: SRTP protocol is not allowed by SMPTE ST 2110-10 Section 6.2.`));
    }
    // Check dynamic range - assume 2110-20 is always dynamic
    let payloadType = +videoMatch[4];
    if (isNaN(payloadType) || payloadType < 96 || payloadType > 127) {
      errors.push(new Error(`Line ${x + 1}: Dynamic payload type expected for SMPTE 2110-defined video.`));
    }
  }
  return errors;
};

// Test ST 2110-20 Section 7.1 Test 3 - All video streams have rtpmap entry raw/90000
const test_20_71_3 = sdp => {
  let errors = [];
  let lines = splitLines(sdp);
  let rtpmapInStream = true;
  let payloadType = -1;
  let streamCount = 0;
  for ( let x = 0 ; x < lines.length ; x++ ) {
    if (lines[x].startsWith('m=')) {
      if (!rtpmapInStream && payloadType >= 0) {
        errors.push(new Error(`Line ${x + 1}: Stream ${streamCount} does not have an 'rtpmap' attribute.`));
      }
      let videoMatch = lines[x].match(videoPattern);
      payloadType = videoMatch ? +videoMatch[4] : -1;
      rtpmapInStream = false;
      streamCount++;
      continue;
    }
    if (lines[x].startsWith('a=rtpmap') && payloadType >= 0) { // Only process video
      let rtpmapMatch = lines[x].match(rtpmapPattern);
      if (!rtpmapMatch) {
        errors.push(new Error(`Line ${x + 1}: For stream ${streamCount}, found an 'rtpmap' attribute that is not an acceptable pattern.`));
        continue;
      }
      if (rtpmapInStream) {
        errors.push(new Error(`Line ${x + 1}: For stream ${streamCount}, found more than one 'rtpmap' attribute.`));
        continue;
      }
      rtpmapInStream = true;
      if (+rtpmapMatch[1] !== payloadType) {
        errors.push(new Error(`Line ${x + 1}: For stream ${streamCount}, found an 'rtpmap' attribute with payload type '${rtpmapMatch[1]}' when stream has payload type '${payloadType}'.`));
      }
      if (rtpmapMatch[2] !== 'raw' ) {
        errors.push(new Error(`Line ${x + 1}: For stream ${streamCount}, encoding name must be media sub-type 'raw', as per SMPTE ST 2110-20 Section 7.1.`));
      }
      if (rtpmapMatch[3] !== '90000') {
        errors.push(new Error(`Line ${x + 1}: For stream ${streamCount}, clock rate must be 90000Hz, as per SMPTE ST 2110-20 Section 7.1.`));
      }
    }
  }
  return errors;
};

// Test ST 2110-20 Section 7.1 Test 4 - All video streams have format parameters
const test_20_71_4 = sdp => {
  let errors = [];
  let lines = splitLines(sdp);
  let fmtpInStream = true;
  let payloadType = -1;
  let streamCount = 0;
  for ( let x = 0 ; x < lines.length ; x++ ) {
    if (lines[x].startsWith('m=')) {
      if (!fmtpInStream && payloadType >= 0) {
        errors.push(new Error (`Line ${x + 1}: Stream ${streamCount} does not have an 'fmtp' attribute.`));
      }
      let videoMatch = lines[x].match(videoPattern);
      payloadType = videoMatch ? +videoMatch[4] : -1;
      fmtpInStream = false;
      streamCount++;
      continue;
    }
    if (lines[x].startsWith('a=fmtp') && payloadType >= 0) {
      let fmtpMatch = lines[x].match(fmtpPattern);
      if (!fmtpMatch) {
        errors.push(new Error(`Line ${x + 1}: For stream ${streamCount}, found an 'fmtp' attribute that is not an acceptable pattern.`));
        continue;
      }
      if (fmtpInStream) {
        errors.push(new Error(`Line ${x + 1}: For stream ${streamCount}, found more than one 'fmtp' attribute.`));
        continue;
      }
      fmtpInStream = true;
      if (+fmtpMatch[1] !== payloadType) {
        errors.push(new Error(`Line ${x + 1}: For stream ${streamCount}, found an 'fmtp' attribute with payload type '${fmtpMatch[1]}' when stream has payload type '${payloadType}'.`));
      }
    }
  }
};

const extractMTParams = sdp => {
  let mtParams = [];
  let lines = splitLines(sdp);
  let streamCount = 0;
  let payloadType = -1;
  for ( let x = 0 ; x < lines.length ; x++ ) {
    if (lines[x].startsWith('m=')) {
      let videoMatch = lines[x].match(videoPattern);
      payloadType = videoMatch ? +videoMatch[4] : -1;
      streamCount++;
      continue;
    }
    if (lines[x].startsWith('a=fmtp') && payloadType >= 0) {
      if (!fmtpPattern.test(lines[x])) {
        continue;
      }
      let paramsMatch = lines[x].match(fmtpParams);
      let splitParams = paramsMatch.map(p => p.split(/[=;]/));
      let paramsObject = splitParams.reduce((x, y) => {
        x[y[0]] = y[1];
        return x;
      }, {});
      paramsObject._payloadType = payloadType;
      paramsObject._line = x;
      paramsObject._streamNumber = streamCount;
      mtParams.push(paramsObject);
    }
  }
  return mtParams;
};

const mustHaves = [ 'sampling', 'depth', 'width', 'height', 'exactframerate',
  'colorimetry', 'PM', 'SSN' ];

// Test ST 2110-20 Section 7.2 Test 1 - Test all required parameters are present
const test_20_72_1 = sdp => {
  let errors = [];
  let mtParams = extractMTParams(sdp);
  for ( let stream of mtParams ) {
    let keys = Object.keys(stream);
    for ( let param of mustHaves ) {
      if (keys.indexOf(param) < 0) {
        errors.push(new Error(`Line ${stream._line}: For stream ${stream._streamNumber}, required parameter '${param}' is missing, as per SMPTE ST 2110-20 Section 7.2.`));
      }
    }
  }
  return errors;
};

// Test ST 2110-20 Section 7.2 Test 2 - Check width and height are within bounds
const test_20_72_2 = sdp => {
  let errors = [];
  let mtParams = extractMTParams(sdp);
  for ( let stream of mtParams ) {
    if (typeof stream.width !== undefined) { // Test 1 confirms
      let width = +stream.width;
      if (isNaN(width) || stream.width.match(integerPattern)) {
        errors.push(new Error(`Line ${stream._line}: For stream ${stream._streamNumber}, parameter 'width' is not an integer value, as per SMPTE ST 2110-20 Section 7.2.`));
      } else if (width < 1 || width > 32767) {
        errors.push(new Error(`Line ${stream._line}: For strean ${stream._streamNumber}, parameter 'width' with value '${width}' is outside acceptable range of 1 to 32767 inclusive, as per SMPTE ST 2110-20 Section 7.2.`));
      }
      let height = +stream.height;
      if (isNaN(height) || stream.height.match(integerPattern)) {
        errors.push(new Error(`Line ${stream._line}: For stream ${stream._streamNumber}, parameter 'height' is not an integer value, as per SMPTE ST 2110-20 Section 7.2.`));
      } else if (height < 1 || height > 32767) {
        errors.push(new Error(`Line ${stream._line}: For stream ${stream._streamNumber}, parameter 'height' with value '${height}' is outside acceptable range of 1 to 32767 inclusive, as per SMPTE ST 2110-20 Section 7.2.`));
      }
    }
  }
  return errors;
};

const greatestCommonDivisor = (a, b) => !b ? a : greatestCommonDivisor(b, a % b);

// Test ST 2110-20 Section 7.2 Test 3 - Exactframerate is as specified
const test_20_72_3 = sdp => {
  let errors = [];
  let mtParams = extractMTParams(sdp);
  for ( let stream of mtParams ) {
    if (typeof stream.exactframerate !== undefined) {
      let frMatch = frameRatePattern.match(stream.exactframerate);
      if (!frMatch) {
        errors.push(new Error(`Line ${stream._line}: For stream ${stream._streamNumber}, parameter 'exactframerate' does not match an acceptable pattern, as per SMPTE ST 2110-20 Section 7.2.`));
        continue;
      }
      let numerator = +frMatch[1];
      if (isNaN(numerator)) {
        errors.push(new Error(`Line ${stream._line}: For stream ${stream._streamNumber}, parameter 'exactframerate' has a numerator that is not an integer, as per SMPTE ST 2110-20 Section 7.2.`));
      }
      if (!frMatch[2]) { // Non-integer value tests
        continue;
      }
      let denominator = +frMatch[2];
      if (isNaN(denominator)) {
        errors.push(new Error(`Line ${stream._line}: For stream ${stream._streamNumber}, parameter 'exactframerate' has a denominator that is not an integer, as per SMPTE ST 2110-20 Section 7.2.`));
        continue;
      }
      if (Number.isInteger(numerator/denominator)) {
        errors.push(new Error(`Line ${stream._line}: For stream ${stream._streamNumber}, parameter 'exactframerate' is an integer rate expressed as a non-integer rational, as per SMPTE ST 2110-20 Section 7.2.`));
      }
      if (denominator > numerator) {
        errors.push(new Error(`Line ${stream._line}: For stream ${stream._streamNumber}, parameter 'exactframerate' specifies a frame rate slower than one per second. Unlikely. Parameter order correct?`));
      }
      if (greatestCommonDivisor(numerator, denominator) !== 1) {
        errors.push(new Error(`Line ${stream._line}: For stream ${stream._streamNumber}, parameter 'exactframerate' specifies a frame rate using integer values that are not the minimum possible, as per SMPTE ST 2110-20 Section 7.2.`));
      }
    }
  }
  return errors;
};

const packingModes = [ '2110GPM', '2110BPM' ];

// Test ST 2110-20 Section 7.2 Test 4 - Check packing mode as per spec.
const test_20_72_4 = sdp => {
  let errors = [];
  let mtParams = extractMTParams(sdp);
  for ( let stream of mtParams ) {
    if (typeof stream.PM !== undefined) {
      if (packingModes.indexOf(stream.PM) < 0) {
        errors.push(new Error(`Line ${stream._line}: For stream ${stream._streamNumber}, parameter 'PM' (packing mode) is not one of the defined values, as per SMPTE ST 2110-20 Sections 7.2 and 6.3.`));
      }
    }
  }
  return errors;
};

// Test ST 2110-20 Section 7.2 Test 5 - Check SSN is the required fixed value
const test_20_72_5 = sdp => {
  let errors = [];
  let mtParams = extractMTParams(sdp);
  for ( let stream of mtParams ) {
    if (typeof stream.SSN !== 'undefined') {
      if (stream.SSN !== 'ST2110-20:2017') {
        errors.push(new Error(`Line ${stream._line}: For stream ${stream._streamNumber}, format parameter 'SSN' is not set to the required value 'ST2110-20:2017', as per SMPTE ST 2110-20 Section 7.2.`));
      }
    }
  }
  return errors;
};

// Test ST 2110-20 Section 7.3 Test 1 - Interlace is name only
const test_20_73_1 = sdp => {
  let errors = [];
  let mtParams = extractMTParams(sdp);
  for ( let stream of mtParams ) {
    if (typeof stream.interlace !== 'undefined') {
      if (stream.interlace !== '') {
        errors.push(new Error(`Line ${stream._line}: For stream ${stream._streamNumber}, format parameter 'interlace' is name only, as per SMPTE ST 2110-20 Section 7.3.`));
      }
    }
  }
  return errors;
};

// Test ST 2110-20 Section 7.3 Test 2- Segmented is name only and interlace is also signalled
const test_20_73_2 = sdp => {
  let errors = [];
  let mtParams = extractMTParams(sdp);
  for ( let stream of mtParams ) {
    if (typeof stream.segmented !== 'undefined') {
      if (stream.segmented !== '') {
        errors.push(new Error(`Line ${stream._line}: For stream ${stream._streamNumber}, format parameter 'segmented' is name only, as per SMPTE ST 2110-20 Section 7.3.`));
      }
      if (typeof stream.interlaced === 'undefined') {
        errors.push(new Error(`Line ${stream._line}: For stream ${stream._streamNumber}, format parameter 'segmented' is signalled without 'interlaced' being signalled, as per SMPTE ST 2110-20 Section 7.3.`));
      }
    }
  }
  return errors;
};

const rangePermitted = [ 'NARROW', 'FULLPROTECT', 'FULL' ];

// Test ST 2110-20 Section 7.3 Test 3 - RANGE has acceptable values in colorimetry context
const test_20_73_3 = sdp => {
  let errors = [];
  let mtParams = extractMTParams(sdp);
  for ( let stream of mtParams ) {
    if (typeof stream.RANGE !== 'undefined') {
      if (stream.colorimetry === 'BT2100') {
        if (stream.RANGE !== 'FULL' && stream.RANGE !== 'NARROW') {
          errors.push(new Error(`Line ${stream._line}: For stream ${stream._streamNumber}, format parameter 'RANGE' is '${stream.RANGE}' and not one of the accpetabe values for colorimetry BT.2100 or 'FULL' or 'NARROW', as per SMPTE ST 2110-20 Section 7.3`));
        }
        continue;
      }
      if (rangePermitted.indexOf(stream.RANGE) < 0) {
        errors.push(new Error(`Line ${stream._line}: For stream ${stream._streamNumber}, format paramter 'RANGE' is '${stream.RANGE}' and not one of the acceptable values 'FULL', 'FULLPROTECT' or 'NARROW', as per SMPTE ST 2110-20 Section 7.3.`));
      }
    }
  }
  return errors;
};

const maxudpPermitted = [ '1460', '8960' ];

// Test ST 2110-20 Section 7.3 Test 4 - MAXUDP has acceptable values wrt ST 2110-10
const test_20_73_4 = sdp => {
  let errors = [];
  let mtParams = extractMTParams(sdp);
  for ( let stream of mtParams ) {
    if (typeof stream.MAXUDP !== 'undefined') {
      if (maxudpPermitted.indexOf(stream.MAXUDP) < 0) {
        errors.push(new Error(`Line ${stream._line}: For stream ${stream._streamNumber}, format parameter 'MAXUDP' is '${stream.MAXUDP} and not one of the acceptable values '1460' or '8960', as per SMPTE ST 2110-20 Section 7.3.`));
      }
    }
  }
  return errors;
};

// Test ST 2110-20 Section 7.3 Test 5 - PAR is an acceptable value
const test_20_73_5 = sdp => {
  let errors = [];
  let mtParams = extractMTParams(sdp);
  for ( let stream of mtParams ) {
    if (typeof stream.PAR !== 'undefined') {
      let parMatch = stream.PAR.match(parPattern);
      if (!parMatch) {
        errors.push(new Error(`Line ${stream._line}: For stream ${stream._streamNumber}, format parameter 'PAR' is not an acceptable pattern, as per SMPTE ST 2110-20 Section 7.3.`));
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

const section_20_71 = (sdp, params) => {
  let tests = [ test_20_71_1, test_20_71_2, test_20_71_3, test_20_71_4 ];
  return concat(tests.map(t => t(sdp, params)));
};

const section_20_72 = (sdp, params) => {
  let tests = [ test_20_72_1, test_20_72_2, test_20_72_3, test_20_72_4,
    test_20_72_5 ];
  return concat(tests.map(t => t(sdp, params)));
};

const section_20_73 = (sdp, params) => {
  let tests = [ test_20_73_1, test_20_73_2, test_20_73_3, test_20_73_4,
    test_20_73_5 ];
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
  let sections = [ section_10_81, section_10_82, section_10_83,
    section_20_71, section_20_72, section_20_73 ];
  if (params.noCopy) {
    sections.push(no_copy);
  }
  return concat(sections.map(s => s(sdp, params)));
};

module.exports = {
  allSections
};
