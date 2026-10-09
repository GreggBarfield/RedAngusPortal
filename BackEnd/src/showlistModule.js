'use strict';
// Puts the showlist email pieces together so app.js needs only one line for them.
// Tests can replace any piece through `overrides`.
const { readShowlistConfig } = require('./showlistConfig');
const { createMailer } = require('./mailer');
const { createShowlistsRepo } = require('./showlists');
const { createSender } = require('./showlistSender');
const { createShowlistsRouter, createMailPublicRouter } = require('./routes/showlists');

function createShowlist({ db, config, users, env = process.env, fetchImpl, log = console, overrides = {} }) {
  const getShowlistConfig = overrides.getShowlistConfig || (() => readShowlistConfig(env, config.siteUrl));
  const showlists = overrides.showlists || createShowlistsRepo(db);
  const mailer = overrides.mailer || createMailer({ getConfig: getShowlistConfig, fetchImpl });
  const sender = overrides.sender || createSender({ repo: showlists, mailer, getConfig: getShowlistConfig });
  return {
    showlists,
    mailer,
    sender,
    getShowlistConfig,
    staffRouter: createShowlistsRouter({ showlists, sender, mailer, users, config, getShowlistConfig }),
    publicRouter: createMailPublicRouter({ showlists, getShowlistConfig, log }),
  };
}

module.exports = { createShowlist };
