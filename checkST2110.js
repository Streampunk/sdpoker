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
const mediaclkTypePattern = /[\r\n]a=mediaclk[^\s=]+/g;
const mediaclkDirectPattern = /[\r\n]a=mediaclk:direct=\d+\s+/g;
const sourceFilterPattern = /a=source-filter:\s(incl|excl)/;
const tsrefclkPattern = /[\r\n]a=ts-refclk/;
const ptpPattern = /traceable|((([0-9a-fA-F]{2}-){7}[0-9a-fA-F]{2})(:(\d+|domain-name=\S+))?)/;
const macPattern = /(([0-9a-fA-F]{2}-){5}[0-9a-fA-F]{2})/;
const dupPattern = /[\r\n]m=[\s\S]+a=ssrc-group:DUP|[\r\n]a=group:DUP[\s\S]+m=/;
const ssrcGroupPattern = /a=ssrc-group:DUP\s+(\d+)\s+(\d+)/;
const groupPattern = /a=group:DUP\s+(\S+)\s+(\S+)/;
const ssrcPattern = /a=ssrc:(\d+)\s/;
const videoPattern = /video\s+(\d+)(\/\d+)?\s+(RTP\/S?AVP)\s+(\d+)/;
const rtpmapPattern = /a=rtpmap:(\d+)\s(\S+)\/(\d+)\s*/;
const fmtpPattern = /a=fmtp:(\d+)\s+(?:([^\s=;]+)(?:=([^\s;]+))?;\s+)*$/;
const fmtpParams = /([^\s=;]+(?:=[^\s;]+)?);/g;
const integerPattern = /^[1-9]\d*$/;
const frameRatePattern = /^([1-9]\d*)(?:\/([1-9]\d*))?$/;
const parPattern = /^([1-9]\d*):([1-9]\d*)$/;
const rtpmapSound = /a=rtpmap:(\d+)\s+(L16|L24)\/([1-9]\d*)\/([1-9]\d*)/;
const ptimePattern = /^a=ptime:(\d+(?:\.\d+)?)$/;
const maxptimePattern = /^a=maxptime:(\d+(?:\.\d+)?)$/;
const audioPattern = /audio\s+(\d+)(\/\d+)?\s+(RTP\/S?AVP)\s+(\d+)/;
const channelOrderPattern = /^a=fmtp:(\d+)\s+.*channel-order=([^\s;]+).*$/;
const smpteChannelPattern =
  /SMPTE2110\.\((M|DM|ST|LtRt|51|71|222|SGRP|U\d\d)(,(M|DM|ST|LtRt|51|71|222|SGRP|U\d\d))*\)/;

const specExample = `v=0
o=- 123456 11 IN IP4 192.168.100.2
s=Example of a SMPTE ST2110-20 signal
i=this example is for 720p video at 59.94
t=0 0
a=recvonly
a=group:DUP primary secondary
m=video 50000 RTP/AVP 112
c=IN IP4 239.100.9.10/32
a=source-filter: incl IN IP4 239.100.9.10 192.168.100.2
a=rtpmap:112 raw/90000
a=fmtp:112 sampling=YCbCr-4:2:2; width=1280; height=720; exactframerate=60000/1001; depth=10; TCS=SDR; colorimetry=BT709; PM=2110GPM; SSN=ST2110-20:2017;
a=ts-refclk:ptp=IEEE1588-2008:39-A7-94-FF-FE-07-CB-D0:37
a=mediaclk:direct=0
a=mid:primary
m=video 50020 RTP/AVP 112
c=IN IP4 239.101.9.10/32
a=source-filter: incl IN IP4 239.101.9.10 192.168.101.2
a=rtpmap:112 raw/90000
a=fmtp:112 sampling=YCbCr-4:2:2; width=1280; height=720; exactframerate=60000/1001; depth=10; TCS=SDR; colorimetry=BT709; PM=2110GPM; SSN=ST2110-20:2017;
a=ts-refclk:ptp=IEEE1588-2008:39-A7-94-FF-FE-07-CB-D0:37
a=mediaclk:direct=0
a=mid:secondary`;

// Test ST2110-10 Section 7.4 Test 1 - Where mediaclk:direct is used with PTP, offset value is zero
const test_10_74_1 = sdp => {
  let errors = [];
  let streams = sdp.split(/[\r\n]m=/).slice(1);
  for ( let s in streams ) {
    let zeroCheck = streams[s].match(mediaclkDirectPattern);
    if (Array.isArray(zeroCheck) && zeroCheck.length > 0 &&
      streams[s].indexOf('IEEE1588-2008') > 0) { // Zero check only PTP clocks
      zeroCheck = zeroCheck.map(z => +(z.trim().split('=')[2]));
      for ( let x in zeroCheck ) {
        if (zeroCheck[x] !== 0) {
          errors.push(new Error(`For stream ${s}, the 'mediaclk' attribute shall have a zero offset when direct-referenced PTP timing is in use, as per SMPTE ST 2110-10 Section 7.4.`));
        }
      }
    }
  }
  return errors;
};

// Test ST2110-10 Section 8.1 Test 1 - Shell have media-level mediaclk per stream
const test_10_81_1 = sdp => {
  let errors = [];
  let streams = sdp.split(/[\r\n]m=/).slice(1);
  for ( let x = 0 ; x < streams.length ; x++ ) {
    if (!mediaclkPattern.test(streams[x])) {
      errors.push(new Error(`Stream ${x + 1}: Each stream description shall have a media-level 'mediaclk' attribute, as per SMPTE ST 2110-10 Section 8.1.`));
    }
  }
  return errors;
};

// Test ST2110-10 Section 8.1 Test 2 - Should have mediaclk using direct reference
const test_10_81_2 = (sdp, params) => {
  if (!params.should) return [];
  let directCheck = sdp.match(mediaclkTypePattern);
  if (Array.isArray(directCheck) && directCheck.length > 0) {
    directCheck = directCheck.filter(x => !x.slice(1).startsWith('a=mediaclk:direct'));
    return concat(directCheck.map(nd =>
      new Error(`The 'direct' reference for the mediaclk paramter should be used, as per SMPTE ST 2110-10 Section 8.1. Found '${nd.slice(1)}'.`)));
  } else {
    return [];
  }
};

// Test ST 2110-10 Section 8.1 Test 3 - Source-filter correctly formatted if present
const test_10_81_3 = sdp => {
  let lines = splitLines(sdp);
  let errors = [];
  for ( let x = 0 ; x < lines.length ; x++ ) {
    if (lines[x].startsWith('a=source-filter:')) {
      let sourceFilterMatch = lines[x].match(sourceFilterPattern);
      if (!sourceFilterMatch) {
        errors.push(new Error(`Line ${x + 1}: Source-filters must follow the pattern 'a=source-filter: <filter-mode> <filter-spec>' as defined in RFC 4570.`));
        continue;
      }
    }
  }
  return errors;
};

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
        errors.push(new Error(`Line ${x + 1}: An example in the first published version of ST2110 suggested 'traceable' was acceptable without preceeding it with 'IEEE1588-2008'. This is not a permitted form in RFC 7273 and has been corrected later versions of ST2110-10.`));
        continue; // no longer acceptable form
      }
      if (!ptpDetails.startsWith('IEEE1588-2008:')) {
        errors.push(new Error(`Line ${x + 1}: The only supported PTP versions are 'IEEE1588-2008' and 'traceable', as per SMPTE ST 2110-10 Section 8.2.`));
        continue;
      }
      if (!ptpPattern.test(ptpDetails.slice(14))) {
        errors.push(new Error(`Line ${x + 1}: RFC 7273 PTP reference clock attribute parameters for 'ptp-server' do not match acceptable patterns.`));
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
  let isAncillary = false;
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
      isAncillary = false;
      streamCount++;
      continue;
    }
    if (lines[x].startsWith('a=rtpmap') && payloadType >= 0) {
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
      if (rtpmapMatch[2] == 'smpte291') { // ancillary data also has 'm=video'
        isAncillary = true;
        continue;
      }
      else if (rtpmapMatch[2] !== 'raw') {
        errors.push(new Error(`Line ${x + 1}: For stream ${streamCount}, encoding name must be media sub-type 'raw', as per SMPTE ST 2110-20 Section 7.1.`));
      }
      if (rtpmapMatch[3] !== '90000') {
        errors.push(new Error(`Line ${x + 1}: For stream ${streamCount}, clock rate must be 90000Hz, as per SMPTE ST 2110-20 Section 7.1.`));
      }
    }
  }
  if (!rtpmapInStream && payloadType >= 0) {
    errors.push(new Error(`Line ${lines.length}: Stream ${streamCount} does not have an 'rtpmap' attribute.`));
  }
  return errors;
};

// Test ST 2110-20 Section 7.1 Test 4 - All video streams have format parameters
const test_20_71_4 = (sdp, params) => {
  let errors = [];
  let lines = splitLines(sdp);
  let fmtpInStream = true;
  let isAncillary = false;
  let payloadType = -1;
  let streamCount = 0;
  for ( let x = 0 ; x < lines.length ; x++ ) {
    if (lines[x].startsWith('m=')) {
      if (!fmtpInStream && payloadType >= 0 && !isAncillary) {
        errors.push(new Error (`Line ${x + 1}: Stream ${streamCount} does not have an 'fmtp' attribute.`));
      }
      let videoMatch = lines[x].match(videoPattern);
      payloadType = videoMatch ? +videoMatch[4] : -1;
      fmtpInStream = false;
      isAncillary = false;
      streamCount++;
      continue;
    }
    if (lines[x].startsWith('a=rtpmap') && payloadType >= 0 && !isAncillary) {
      let rtpmapMatch = lines[x].match(rtpmapPattern);
      if (!rtpmapMatch) {
        continue;
      }
      if (rtpmapMatch[2] == 'smpte291') { // ancillary data also has 'm=video'
        isAncillary = true;
        continue;
      }
    }
    if (lines[x].startsWith('a=fmtp') && payloadType >= 0) {
      let fmtpLine = params.whitespace === true ? lines[x] : lines[x].trim() + ' ';
      let fmtpMatch = fmtpLine.match(fmtpPattern);
      if (!fmtpMatch) {
        errors.push(new Error(`Line ${x + 1}: For stream ${streamCount}, found an 'fmtp' attribute that is not an acceptable pattern. Note: In strict whitespace adherence, line must have a space after the last semicolon.`));
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
  if (!fmtpInStream && payloadType >= 0 && !isAncillary) {
    errors.push(new Error (`Line ${lines.length}: Stream ${streamCount} does not have an 'fmtp' attribute.`));
  }
  return errors;
};

// Test for duplicate parameters by setting params.checkDups
const extractMTParams = (sdp, params = {}) => {
  let mtParams = [];
  let errors = [];
  let lines = splitLines(sdp);
  let isAncillary = false;
  let streamCount = 0;
  let payloadType = -1;
  for ( let x = 0 ; x < lines.length ; x++ ) {
    if (lines[x].startsWith('m=')) {
      let videoMatch = lines[x].match(videoPattern);
      payloadType = videoMatch ? +videoMatch[4] : -1;
      streamCount++;
      isAncillary = false;
      continue;
    }
    if (lines[x].startsWith('a=rtpmap') && payloadType >= 0) {
      let rtpmapMatch = lines[x].match(rtpmapPattern);
      if (rtpmapMatch && rtpmapMatch[2] == 'smpte291') { // ancillary data also has 'm=video'
        isAncillary = true;
        continue;
      }
    }
    if (lines[x].startsWith('a=fmtp') && payloadType >= 0 && !isAncillary) {
      let fmtpLine = params.whitespace === true ? lines[x] : lines[x].trim() + ' ';
      if (!fmtpPattern.test(fmtpLine)) {
        continue;
      }
      let paramsMatch = lines[x].match(fmtpParams);
      let splitParams = paramsMatch.map(p => p.split(/[=;]/));
      if (params.checkDups) {
        let keys = splitParams.map(p => p[0]);
        let reported = [];
        for ( let y in keys ) {
          if (keys.filter(k => keys[y] === k).length >= 2) {
            if (reported.indexOf(keys[y]) < 0) {
              errors.push(new Error(`Line ${x + 1}: For stream ${streamCount}, parameter '${keys[y]}' appears more than once.`));
              reported.push(keys[y]);
            }
          }
        }
      }
      let paramsObject = splitParams.reduce((x, y) => {
        x[y[0]] = y[1];
        return x;
      }, {});
      paramsObject._payloadType = payloadType;
      paramsObject._line = x + 1;
      paramsObject._streamNumber = streamCount;
      mtParams.push(paramsObject);
    }
  }
  return [ mtParams, errors ];
};

const mustHaves = [ 'sampling', 'depth', 'width', 'height', 'exactframerate',
  'colorimetry', 'PM', 'SSN' ];

// Test ST 2110-20 Section 7.2 Test 1 - Test all required parameters are present
const test_20_72_1 = sdp => {
  let [ mtParams, errors ] = extractMTParams(sdp, { checkDups: true });
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
const test_20_72_2 = (sdp, params) => {
  let [ mtParams, errors ] = extractMTParams(sdp, params);
  for ( let stream of mtParams ) {
    if (typeof stream.width !== 'undefined' && typeof stream.height !== 'undefined') { // Test 1 confirms
      let width = +stream.width;
      if (isNaN(width) || integerPattern.test(stream.width) === false) {
        errors.push(new Error(`Line ${stream._line}: For stream ${stream._streamNumber}, parameter 'width' is not an integer value, as per SMPTE ST 2110-20 Section 7.2.`));
      } else if (width < 1 || width > 32767) {
        errors.push(new Error(`Line ${stream._line}: For strean ${stream._streamNumber}, parameter 'width' with value '${width}' is outside acceptable range of 1 to 32767 inclusive, as per SMPTE ST 2110-20 Section 7.2.`));
      }
      let height = +stream.height;
      if (isNaN(height) || integerPattern.test(stream.height) === false) {
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
const test_20_72_3 = (sdp, params) => {
  let [ mtParams, errors ] = extractMTParams(sdp, params);
  for ( let stream of mtParams ) {
    if (typeof stream.exactframerate !== 'undefined') {
      let frMatch = stream.exactframerate.match(frameRatePattern);
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
const test_20_72_4 = (sdp, params) => {
  let [ mtParams, errors ] = extractMTParams(sdp, params);
  for ( let stream of mtParams ) {
    if (typeof stream.PM !== 'undefined') {
      if (packingModes.indexOf(stream.PM) < 0) {
        errors.push(new Error(`Line ${stream._line}: For stream ${stream._streamNumber}, parameter 'PM' (packing mode) is not one of the defined values, as per SMPTE ST 2110-20 Sections 7.2 and 6.3.`));
      }
    }
  }
  return errors;
};

// Test ST 2110-20 Section 7.2 Test 5 - Check SSN is the required fixed value
const test_20_72_5 = (sdp, params) => {
  let [ mtParams, errors ] = extractMTParams(sdp, params);
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
const test_20_73_1 = (sdp, params) => {
  let [ mtParams, errors ] = extractMTParams(sdp, params);
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
const test_20_73_2 = (sdp, params) => {
  let [ mtParams, errors ] = extractMTParams(sdp, params);
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
const test_20_73_3 = (sdp, params) => {
  let [ mtParams, errors ] = extractMTParams(sdp, params);
  for ( let stream of mtParams ) {
    if (typeof stream.RANGE !== 'undefined') {
      if (stream.colorimetry === 'BT2100') {
        if (stream.RANGE !== 'FULL' && stream.RANGE !== 'NARROW') {
          errors.push(new Error(`Line ${stream._line}: For stream ${stream._streamNumber}, format parameter 'RANGE' is '${stream.RANGE}' and not one of the acceptable values for colorimetry BT.2100 of 'FULL' or 'NARROW', as per SMPTE ST 2110-20 Section 7.3`));
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
const test_20_73_4 = (sdp, params) => {
  let [ mtParams, errors ] = extractMTParams(sdp, params);
  for ( let stream of mtParams ) {
    if (typeof stream.MAXUDP !== 'undefined') {
      if (maxudpPermitted.indexOf(stream.MAXUDP) < 0) {
        errors.push(new Error(`Line ${stream._line}: For stream ${stream._streamNumber}, format parameter 'MAXUDP' is '${stream.MAXUDP}' and not one of the acceptable values '1460' or '8960', as per SMPTE ST 2110-20 Section 7.3.`));
      }
    }
  }
  return errors;
};

// Test ST 2110-20 Section 7.3 Test 5 - PAR is an acceptable value
const test_20_73_5 = (sdp, params) => {
  let [ mtParams, errors ] = extractMTParams(sdp, params);
  for ( let stream of mtParams ) {
    if (typeof stream.PAR !== 'undefined') {
      let parMatch = stream.PAR.match(parPattern);
      if (!parMatch) {
        errors.push(new Error(`Line ${stream._line}: For stream ${stream._streamNumber}, format parameter 'PAR' is not an acceptable pattern, as per SMPTE ST 2110-20 Section 7.3.`));
        continue;
      }
      let [ numerator, denominator ] = [ +parMatch[1], +parMatch[2] ];
      if (greatestCommonDivisor(numerator, denominator) > 1) {
        errors.push(new Error(`Line ${stream._line}: For stream ${stream._streamNumber}, format parameter 'PAR' with value '${stream.PAR}' is a ratio that is not expressed with the smallest possible values, as per SMPTE ST 2110-20 Section 7.3.`));
      }
    }
  }
  return errors;
};

const samplingPermitted = [
  'YCbCr-4:4:4',   'YCbCr-4:2:2',   'YCbCr-4:2:0',
  'CLYCbCr-4:4:4', 'CLYCbCr-4:2:2', 'CLYCbCr-4:2:0',
  'ICtCp-4:4:4',   'ICtCp-4:2:2',   'ICtCp-4:2:0',
  'RGB', 'XYZ', 'KEY'
];

// Test ST 2110-20 Section 7.4 Test 1 - Sampling is a defined value
const test_20_74_1 = (sdp, params) => {
  let [ mtParams, errors ] = extractMTParams(sdp, params);
  for ( let stream of mtParams ) {
    if (typeof stream.sampling !== 'undefined') {
      if (samplingPermitted.indexOf(stream.sampling) < 0) {
        errors.push(new Error(`Line ${stream._line}: For stream ${stream._streamNumber}, format parameter 'sampling' is not an acceptable value, as per SMPTE ST 2110-20 Section 7.4.1.`));
        continue;
      }
      // TODO colorimetry-specific tests - if possible
    }
  }
  return errors;
};

const depthPermitted = [ '8', '10', '12', '16', '16f' ];

// Test ST 2110-20 Section 7.4 Test 2 - Bit depth is a permitted value
const test_20_74_2 = (sdp, params) => {
  let [ mtParams, errors ] = extractMTParams(sdp, params);
  for ( let stream of mtParams ) {
    if (typeof stream.depth !== 'undefined') {
      if (depthPermitted.indexOf(stream.depth) < 0) {
        errors.push(new Error(`Line ${stream._line}: For stream ${stream._streamNumber}, format parameter 'depth' is not one of 8, 10, 12 or 16/16f, as per SMPTE ST 2110-20 Section 7.4.2.`));
      }
    }
  }
  return errors;
};

const colorPermitted = [
  'BT601', 'BT709', 'BT2020', 'BT2100', 'ST2065-1',
  'ST2065-3', 'UNSPECIFIED', 'XYZ' ];

// Test ST 2110-20 Section 7.5 Test 1 - Colorimetry is a permitted value.
const test_20_75_1 = (sdp, params) => {
  let [ mtParams, errors ] = extractMTParams(sdp, params);
  for ( let stream of mtParams ) {
    if (typeof stream.colorimetry !== 'undefined') {
      if (colorPermitted.indexOf(stream.colorimetry) < 0) {
        errors.push(new Error(`Line ${stream._line}: For stream ${stream._streamNumber}, format parameter 'colorimetry' is not a permitted value, as per SMPTE 2110-20 Section 7.5.`));
      }
    }
  }
  return errors;
};

// Test ST 2110-20 Section 7.5 Test 2 - Signals using BT.2100 should specify RANGE
const test_20_75_2 = (sdp, params) => {
  if (params.should === false) {
    return [];
  }
  let [ mtParams, errors ] = extractMTParams(sdp, params);
  for ( let stream of mtParams ) {
    if (typeof stream.colorimetry !== 'undefined') {
      if (stream.colorimetry === 'BT2100' && typeof stream.RANGE === 'undefined') {
        errors.push(new Error(`Line ${stream._line}: For stream ${stream._streamNumber}, format parameter 'colorimetry' is 'BT2100' and so a 'RANGE' parameter should also be specified, as per SMPTE 2110-20 Section 7.5.`));
      }
    }
  }
  return errors;
};

const tcsPermitted = [
  'SDR', 'PQ', 'HLG', 'LINEAR', 'BT2100LINPQ', 'BT2100LINHLG', 'ST2065-1',
  'ST428-1', 'DENSITY', 'UNSPECIFIED'
];

// Test ST 2110-20 Section 7.6 Test 1 - TCS is a permitted value
const test_20_76_1 = (sdp, params) => {
  let [ mtParams, errors ] = extractMTParams(sdp, params);
  for ( let stream of mtParams ) {
    if (typeof stream.TCS !== 'undefined') {
      if (tcsPermitted.indexOf(stream.TCS) < 0) {
        errors.push(new Error(`Line ${stream._line}: For stream ${stream._streamNumber}, format parameter 'TCS' (Transfer Characteristic System) is not a permitted value, as per SMPTE 2110-20 Section 7.6.`));
      }
    }
  }
  return errors;
};

const sampleRatePermitted = [ '44100', '48000', '96000' ];

// Note: Sample rate provisions of 6.1 are repeated by 6.2.1 reference to AES-67 7.1

// Test ST 2110-30 Section 6.2.1 Test 1 - Compliance with AES-67 Section 7.1
const test_30_62_1 = sdp => {
  let errors = [];
  let lines = splitLines(sdp);
  let payloadType = -1;
  let streamCount = 0;
  let hasRtpmap = true;
  for ( let x = 0 ; x < lines.length ; x++ ) {
    if (lines[x].startsWith('m=')) {
      if (hasRtpmap === false && payloadType >= 0) {
        errors.push(new Error(`Line ${x + 1}: For stream ${streamCount}, required attribute 'rtpmap' is missing for audio stream.`));
      }
      let audioMatch = lines[x].match(audioPattern);
      payloadType = audioMatch ? +audioMatch[4] : -1;
      streamCount++;
      hasRtpmap = false;
      continue;
    }
    if (payloadType >= 0 && lines[x].startsWith('a=rtpmap')) {
      let soundMatch = lines[x].match(rtpmapSound);
      if (!soundMatch) {
        errors.push(new Error(`Line ${x + 1}: For stream ${streamCount}, attribute 'rtpmap' does not match the acceptable audio pattern, e.g. L16 or L24 audio as per AES-67.`));
        continue;
      }
      if (hasRtpmap) {
        errors.push(new Error(`Line ${x + 1}: For stream ${streamCount}, attribute 'rtpmap' is unexpectedly duplicated.`));
      }
      hasRtpmap = true;
      if (payloadType !== +soundMatch[1]) {
        errors.push(new Error(`Line ${x + 1}: For stream ${streamCount}, attribute 'rtpmap' has payload type '${soundMatch[1]}' that is different from stream payload type '${payloadType}'.`));
      }
      if (sampleRatePermitted.indexOf(soundMatch[3]) < 0) {
        errors.push(new Error(`Line ${x + 1}: For stream ${streamCount}, attribute 'rtpmap' specifies an unacceptable sampling rate '${soundMatch[3]}', as per SMPTE ST 2110-30 Section 6.1 and AES-67 Section 7.1.`));
      }
      switch (+soundMatch[3]) {
      case 48000:
        break; // L16 and L24 are supported
      case 96000:
        if (soundMatch[2] === 'L16') {
          errors.push(new Error(`Line ${x + 1}: For stream ${streamCount}, attribute 'rtpmap' describes an out-of-scope combination of 'L16/96000', as per SMPTE ST 2110-30 Section 6.2.1 requiring AES-67 Section 7.1.`));
        }
        break;
      case 44100:
        if (soundMatch[2] === 'L24') {
          errors.push(new Error(`Line ${x + 1}: For stream ${streamCount}, attribute 'rtpmap' describes an out-of-scope combination of 'L24/44100', as per SMPTE ST 2110-30 Section 6.2.1 requiring AES-67 Section 7.1.`));
        }
        break;
      default:
        break;
      }
    }
  }
  if (hasRtpmap === false && payloadType >= 0) {
    errors.push(new Error(`Line ${lines.length}: For stream ${streamCount}, required attribute 'rtpmap' is missing for audio stream.`));
  }
  return errors;
};

// Test ST 2110-30 Section 6.2.1 Test 2 - Valid audio SDP
const test_30_62_2 = sdp => {
  let errors = [];
  let lines = splitLines(sdp);
  for ( let x = 0 ; x < lines.length ; x++ ) {
    if (!lines[x].startsWith('m=audio')) {
      continue;
    }
    let audioMatch = lines[x].match(audioPattern);
    if (!audioMatch) {
      errors.push(new Error(`Line ${x + 1}: Found a media description for audio with a pattern that is not acceptable.`));
      continue;
    }
    // Check port number - SMPTE 2110-10 Section 6.2 says shall be UDP, so assume 0-65535
    let port = +audioMatch[1];
    if (isNaN(port) || port < 0 || port > 65535) {
      errors.push(new Error(`Line ${x + 1}: RTP audio stream description with invalid port '${port}', with reference to ST 2110-10 Section 6.2 'shall use UDP'.`));
    }
    // Check RTP type - SMPTE 2110-10 Section 6.2 says shall be RTP, no allowance for SRTP
    if (audioMatch[3] === 'RTP/SAVP') {
      errors.push(new Error(`Line ${x + 1}: SRTP protocol is not allowed by SMPTE ST 2110-10 Section 6.2.`));
    }
    // Check dynamic range - assume 2110-30 is always dynamic
    let payloadType = +audioMatch[4];
    if (isNaN(payloadType) || payloadType < 96 || payloadType > 127) {
      errors.push(new Error(`Line ${x + 1}: Dynamic payload type expected for SMPTE 2110-defined audio.`));
    }
  }
  return errors;
};

// Test ST 2110-30 Section 6.2.1 Test 3 - SDP conformance - packet time signalling
const test_30_62_3 = sdp => {
  let errors = [];
  let lines = splitLines(sdp);
  let streamCount = 0;
  let hasPTime = true;
  let payloadType = -1;
  for ( let x = 0 ; x < lines.length ; x++ ) {
    if (lines[x].startsWith('m=')) {
      if (!hasPTime && payloadType >= 0) {
        errors.push(new Error(`Line ${x + 1}: For stream ${streamCount}, required attribute 'ptime' is missing, as per SMPTE ST 2110-30 Section 6.2.1 requiring AES-67 Section 8.1.`));
      }
      let audioMatch = lines[x].match(audioPattern);
      streamCount++;
      payloadType = audioMatch ? +audioMatch[4] : -1;
      hasPTime = false;
      continue;
    }
    if (lines[x].startsWith('a=ptime') && payloadType >= 0) {
      let ptimeMatch = lines[x].match(ptimePattern);
      if (!ptimeMatch) {
        errors.push(new Error(`Line ${x + 1}: For stream ${streamCount}, attribute 'ptime' is not an acceptable pattern, as per SMPTE ST 2110-30 Section 6.2.1 requiring AES-67 Section 8.1.`));
        continue;
      }
      if (hasPTime) {
        errors.push(new Error(`Line ${x + 1}: For stream ${streamCount}, attribute 'ptime' is unexpectedly duplicated, which is ambiguous for AES-67 in context of ST 2110-30.`));
        continue;
      }
      hasPTime = true;
      // TODO check ptime by sample rate?
    }
    if (lines[x].startsWith('a=maxptime')) {
      if (!maxptimePattern.test(lines[x])) {
        errors.push(new Error(`Line ${x + 1}: For stream ${streamCount}, attribute 'maxptime' is not an acceptable pattern, as per SMPTE ST 2110-30 Section 6.2.1 requiring AES-67 Section 8.1.`));
      }
    }
  }
  if (!hasPTime && payloadType >= 0) {
    errors.push(new Error(`Line ${lines.length}: For stream ${streamCount}, required attribute 'ptime' is missing, as per ST 2110-30 Section 6.2.1 requiring AES-67 Section 8.1.`));
  }
  return errors;
};

// Test ST 2110-30 Section 6.2.2 Test 4 - Channel order format - where present
const test_30_62_4 = (sdp, params) => {
  let errors = [];
  let lines = splitLines(sdp);
  let streamCount = 0;
  let hasFmtp = true;
  let payloadType = -1;
  for ( let x = 0 ; x < lines.length ; x++ ) {
    if (lines[x].startsWith('m=')) {
      if (params.channelOrder === true && hasFmtp === false && payloadType >= 0) {
        errors.push(new Error(`Line ${x + 1}: For stream ${streamCount}, channel order for an audio stream is required by test parameters but is not present.`));
      }
      let audioMatch = lines[x].match(audioPattern);
      payloadType = audioMatch ? +audioMatch[4] : -1;
      streamCount++;
      hasFmtp = false;
      continue;
    }
    if (lines[x].startsWith('a=fmtp') && (payloadType >= 0)) {
      let fmtpMatch = lines[x].match(channelOrderPattern);
      if (fmtpMatch === null) {
        if (params.channelOrder === true) {
          errors.push(new Error(`Line ${x + 1}: For stream ${streamCount}, audio stream attribute 'fmtp' does not contain a channel order parameter, as required by testing parameters.`));
        }
        hasFmtp = true;
        continue;
      }
      if (hasFmtp) {
        errors.push(new Error(`Line ${x + 1}: For stream ${streamCount}, audio stream contains duplicate 'fmtp' attribute.`));
      }
      hasFmtp = true;
      if (payloadType !== +fmtpMatch[1]) {
        errors.push(new Error(`Line ${x + 1}: For stream ${streamCount}, payload type of 'fmtp' attribute '${fmtpMatch[1]}' does not match that of the stream '${payloadType}'.`));
      }
      let order = fmtpMatch[2];
      if (params.should === true && !order.startsWith('SMPTE2110')) {
        errors.push(new Error(`Line ${x + 1}: For stream ${streamCount}, format parameter 'channel-order' should be specified by the 'SMPTE2110' convention, not '${order.split('.')[0]}', as per SMPTE ST 2110-30 Section 6.2.2.`));
      }
      if (order.startsWith('SMPTE2110') && !smpteChannelPattern.test(order)) {
        errors.push(new Error(`Line ${x + 1}: For stream ${streamCount}, format parameter 'channel-order' is not acceptable, as per SMPTE ST 2110-30 Section 6.2.2.`));
      }
    }
  }
  if (params.channelOrder === true && hasFmtp === false && payloadType >= 0) {
    errors.push(new Error(`Line ${lines.lengths}: For stream ${streamCount}, channel order for an audio stream is required by test parameters but is not present.`));
  }
  return errors;
};

// Test ST 2110-20 Section 7.1 Test 1 - If required, check all streams are video
const test_30_62_5 = (sdp, params) => {
  let streams = sdp.split(/[\r\n]m=/);
  let errors = [];
  if (params.audioOnly) {
    for ( let s = 1 ; s < streams.length ; s++ ) {
      if (!streams[s].startsWith('audio')) {
        errors.push(new Error(`Stream ${s}: Media type is not 'audio' and audio only files are in test.`));
      }
    }
  }
  return errors;
};

// Test ST 2110-21 Section 8.1 - When traffic shaping, TP parameter is specified.
const test_21_81_1 = (sdp, params) => {
  if (params.shaping === false || params.audioOnly === true) {
    return [];
  }
  let [ mtParams, errors ] = extractMTParams(sdp, params);
  for ( let stream of mtParams ) {
    if ( typeof stream.TP === 'undefined') {
      errors.push(new Error(`Line ${stream._line}: For stream ${stream._streamNumber}, parameter 'TP' is not provided, as required by SMPTE ST 2110-21 Section 8.1.`));
    }
  }
  return errors;
};

const typesPermitted = [ '2110TPN', '2110TPNL', '2110TPW' ];

// Test ST 2110-21 Section 8.1 - When traffic shaping, TP parameter is an acceptable value
const test_21_81_2 = (sdp, params) => {
  if (params.shaping === false || params.audioOnly === true) {
    return [];
  }
  let [ mtParams, errors ] = extractMTParams(sdp, params);
  for ( let stream of mtParams ) {
    if ( typeof stream.TP !== 'undefined' ) {
      if (typesPermitted.indexOf(stream.TP) < 0) {
        errors.push(new Error(`Line ${stream._line}: For stream ${stream._streamNumber}, format parameter 'TP' is not one of '2110TPN', '2110TPNL' or '2110TPW', as per SMPTE ST 2110-21 Section 8.1.`));
      }
    }
  }
  return errors;
};

// Test ST 2110-21 Section 8.2 - When traffic shaping and TROFF parameter specified, it is an acceptable value
const test_21_82_1 = (sdp, params) => {
  if (params.shaping === false || params.audioOnly === true) {
    return [];
  }
  let [ mtParams, errors ] = extractMTParams(sdp, params);
  for ( let stream of mtParams ) {
    if ( typeof stream.TROFF !== 'undefined' ) {
      let troff = +stream.TROFF;
      if (isNaN(troff)) {
        errors.push(new Error(`Line ${stream._line}: For stream ${stream._streamNumber}, TR OFFSET value is not a number, as per SMPTE ST 2110-21 Section 8.2.`));
        continue;
      }
      if (troff < 0) {
        errors.push(new Error(`Line ${stream._line}: For stream ${stream._streamNumber}, TR OFFSET cannot be negatibe, as per SMPTE ST 2110-21 Section 8.2.`));
      }
      // TODO not clear if this has to be an integer number of microseconds or can be a decimal value?
    }
  }
  return errors;
};

// Test ST 2110-21 Section 8.2 - When traffic shaping and CMAX parameter specified, it is an acceptable value
const test_21_82_2 = (sdp, params) => {
  if (params.shaping === false || params.audioOnly === true) {
    return [];
  }
  let [ mtParams, errors ] = extractMTParams(sdp, params);
  for ( let stream of mtParams ) {
    if ( typeof stream.CMAX !== 'undefined' ) {
      let cmax = +stream.CMAX;
      if (isNaN(cmax)) {
        errors.push(new Error(`Line ${stream._line}: For stream ${stream._streamNumber}, CMAX parameter is not a number, as per SMPTE ST 2110-21 Section 8.2.`));
        continue;
      }
      if (Number.isInteger(cmax) === false) {
        errors.push(new Error(`Line ${stream._line}: For stream ${stream._streamNumber}, CMAX parameter in not an integer, as per SMPTE ST 2110-21 Section 8.2.`));
      }
      if (cmax < 1) {
        errors.push(new Error(`Line ${stream._line}: For stream ${stream._streamNumber}, CMAX parameter makes no sense unless it is a positive value, as per SMPTE ST 2110-21 Section 8.2.`));
      }
    }
  }
  return errors;
};

const section_10_74 = (sdp, params) => {
  let tests = [ test_10_74_1 ];
  return concat(tests.map(t => t(sdp, params)));
};

const section_10_81 = (sdp, params) => {
  let tests = [ test_10_81_1, test_10_81_2, test_10_81_3 ];
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

const section_20_74 = (sdp, params) => {
  let tests = [ test_20_74_1, test_20_74_2 ];
  return concat(tests.map(t => t(sdp, params)));
};

const section_20_75 = (sdp, params) => {
  let tests = [ test_20_75_1, test_20_75_2 ];
  return concat(tests.map(t => t(sdp, params)));
};

const section_20_76 = (sdp, params) => {
  let tests = [ test_20_76_1 ];
  return concat(tests.map(t => t(sdp, params)));
};

const section_30_62 = (sdp, params) => {
  let tests = [ test_30_62_1, test_30_62_2, test_30_62_3, test_30_62_4, test_30_62_5 ];
  return concat(tests.map(t => t(sdp, params)));
};

const section_21_81 = (sdp, params) => {
  let tests = [ test_21_81_1, test_21_81_2 ];
  return concat(tests.map(t => t(sdp, params)));
};

const section_21_82 = (sdp, params) => {
  let tests = [ test_21_82_1, test_21_82_2 ];
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
  let sections = [
    section_10_74, section_10_81, section_10_82, section_10_83,
    section_20_71, section_20_72, section_20_73, section_20_74,
    section_20_75, section_20_76, section_30_62,
    section_21_81, section_21_82  ];
  if (params.noCopy) {
    sections.push(no_copy);
  }
  return concat(sections.map(s => s(sdp, params)));
};

module.exports = {
  allSections,
  section_10_74,
  section_10_81,
  section_10_82,
  section_10_83,
  section_20_71,
  section_20_72,
  section_20_73,
  section_20_74,
  section_20_75,
  section_20_76,
  section_30_62,
  section_21_81,
  section_21_82
};
