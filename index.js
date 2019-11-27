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
const { allSections : checkRFC4566 } = require('./checkRFC4566.js');
const { allSections : checkST2110 } = require('./checkST2110.js');

const getSDP = (path) => {
  return (path.startsWith('http')) ?
    request({
      url: path,
      resolveWithFullResponse: true
    }).then(res => {
      if (!res.headers['content-type'].startsWith('application/sdp')) {
        return Promise.reject(new Error(
          `Media type (MIME type/Content-Type) of SDP file is '${res.headers['content-type']}' and not signalled as 'applicatio/sdp' as required in RFC 4566 Section 5.`));
      } else {
        return Promise.resolve(res.body);
      }
    }, e => Promise.reject(e)) :
    readFile(path, 'utf8');
};

module.exports = {
  getSDP,
  checkRFC4566,
  checkST2110
};
