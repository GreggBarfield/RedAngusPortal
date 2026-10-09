'use strict';
// Settings for the showlist email. They come from C:\raaaa\.env on the server and are read
// when needed, so a change only needs the API restarted. Nothing here has a secret in it
// except SMTP2GO_API_KEY and SMTP2GO_WEBHOOK_TOKEN, which are typed into .env by hand.
//
//   SMTP2GO_API_KEY            the SMTP2GO API key for this portal (required to send)
//   SMTP2GO_WEBHOOK_TOKEN      a long random password SMTP2GO sends back with delivery reports
//   SHOWLIST_FROM              the sending address (default info@blocktrustnetwork.com)
//   SHOWLIST_FROM_NAME         the name people see (default Red Angus Association Marketing Portal)
//   SHOWLIST_REPLY_TO          where replies go (default: the sending address)
//   SHOWLIST_POSTAL_ADDRESS    the mailing address shown at the bottom of every email (required to send)
//   SITE_URL                   already set in config.js (used for links in the email)

function clean(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function readShowlistConfig(env = process.env, siteUrl = '') {
  const from = clean(env.SHOWLIST_FROM) || 'info@blocktrustnetwork.com';
  return {
    apiKey: clean(env.SMTP2GO_API_KEY),
    webhookToken: clean(env.SMTP2GO_WEBHOOK_TOKEN),
    from,
    fromName: clean(env.SHOWLIST_FROM_NAME) || 'Red Angus Association Marketing Portal',
    replyTo: clean(env.SHOWLIST_REPLY_TO) || from,
    postalAddress: clean(env.SHOWLIST_POSTAL_ADDRESS),
    siteUrl: (clean(siteUrl) || clean(env.SITE_URL) || 'https://redangus.blocktrustnetwork.com').replace(/\/+$/, ''),
  };
}

// What is still missing before emails can go out (empty list = ready).
function missingSettings(cfg) {
  const out = [];
  if (!cfg.apiKey) out.push('SMTP2GO_API_KEY');
  if (!cfg.postalAddress) out.push('SHOWLIST_POSTAL_ADDRESS');
  return out;
}

module.exports = { readShowlistConfig, missingSettings };
