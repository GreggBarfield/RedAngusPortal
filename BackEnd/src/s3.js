'use strict';
// Photo storage in BTN's S3 bucket. The bucket is shared with BTN, so every
// key this portal reads, writes or deletes must start with listings/raa/.
// The check is made here, in one place, before any call reaches AWS.
const PREFIX = 'listings/raa/';

function assertRaaKey(key) {
  if (
    typeof key !== 'string' ||
    !key.startsWith(PREFIX) ||
    key.length <= PREFIX.length ||
    key.includes('..') ||
    key.includes('\\') ||
    key.includes('//')
  ) {
    throw new Error('refusing to touch an S3 key outside ' + PREFIX);
  }
  return key;
}

// client is only passed in by tests; the real one is built from the settings.
function createStorage({ config, client } = {}) {
  let s3 = client || null;
  let sdk = null;

  function available() {
    if (client) return true;
    return Boolean(config && config.s3Bucket && config.awsRegion && config.awsAccessKeyId && config.awsSecretAccessKey);
  }

  function getClient() {
    if (s3) return s3;
    sdk = require('@aws-sdk/client-s3');
    s3 = new sdk.S3Client({
      region: config.awsRegion,
      credentials: { accessKeyId: config.awsAccessKeyId, secretAccessKey: config.awsSecretAccessKey },
    });
    return s3;
  }

  function command(name, input) {
    if (!sdk) sdk = require('@aws-sdk/client-s3');
    return new sdk[name + 'Command'](input);
  }

  const bucket = () => (config && config.s3Bucket) || 'test-bucket';

  return {
    available,
    PREFIX,

    async put(key, body, contentType) {
      assertRaaKey(key);
      await getClient().send(
        command('PutObject', {
          Bucket: bucket(),
          Key: key,
          Body: body,
          ContentType: contentType,
          // Every file name is a new random name, so browsers may keep it for a year.
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
    },

    async remove(keys) {
      const list = (Array.isArray(keys) ? keys : [keys]).filter(Boolean);
      for (const key of list) assertRaaKey(key);
      for (const key of list) {
        await getClient().send(command('DeleteObject', { Bucket: bucket(), Key: key }));
      }
    },
  };
}

module.exports = { createStorage, assertRaaKey, PREFIX };
