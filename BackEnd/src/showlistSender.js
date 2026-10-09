'use strict';
const { renderShowlist } = require('./showlistEmail');

// Works through the waiting emails of one showlist, a few at a time, in the background of the API.
// The send route answers staff right away; this keeps going afterwards. If SMTP2GO refuses the key,
// it stops and leaves the rest waiting so staff can fix the key and press Resume.
function createSender({ repo, mailer, getConfig, render = renderShowlist, concurrency = 3, log = console }) {
  const active = new Set();

  function isActive(id) {
    return active.has(Number(id));
  }

  function anyActive() {
    return active.size > 0;
  }

  // Resolves when every waiting email of this showlist has been handled (or the run stopped).
  async function run(showlistId) {
    const id = Number(showlistId);
    if (active.has(id)) return { skipped: true };
    active.add(id);
    let fatal = '';
    try {
      const sl = await repo.getShowlist(id);
      if (!sl) return { missing: true };
      const cfg = getConfig();
      const lots = Array.isArray(sl.lots) ? sl.lots : [];
      let stop = false;
      for (;;) {
        const batch = await repo.claim(id, concurrency);
        if (batch.length === 0) break;
        await Promise.all(
          batch.map(async (row) => {
            if (stop) {
              await repo.requeue(row.id);
              return;
            }
            const unsubscribeUrl = `${cfg.siteUrl}/unsubscribe/${row.token}`;
            const oneClickUrl = `${cfg.siteUrl}/api/unsubscribe/${row.token}`;
            const { html, text } = render({
              subject: sl.subject,
              intro: sl.intro,
              lots,
              siteUrl: cfg.siteUrl,
              postalAddress: cfg.postalAddress,
              fromName: cfg.fromName,
              unsubscribeUrl,
            });
            const res = await mailer.send({
              to: row.recipient,
              subject: `${sl.subject} [ref:${row.id}]`,
              html,
              text,
              headers: [
                { header: 'List-Unsubscribe', value: `<${oneClickUrl}>` },
                { header: 'List-Unsubscribe-Post', value: 'List-Unsubscribe=One-Click' },
              ],
            });
            if (res.ok) await repo.markSubmitted(row.id, res.emailId);
            else if (res.fatal) {
              stop = true;
              fatal = res.error;
              await repo.requeue(row.id);
            } else await repo.markSubmitFailed(row.id, res.error);
          }),
        );
        if (stop) break;
      }
      if (fatal) log.error(`showlist ${id} stopped: ${fatal}`);
      return { stopped: Boolean(fatal), error: fatal };
    } catch (err) {
      log.error(`showlist ${id} run failed: ${err.message}`);
      return { stopped: true, error: err.message };
    } finally {
      active.delete(id);
    }
  }

  function start(showlistId) {
    run(showlistId).catch(() => {});
  }

  return { run, start, isActive, anyActive };
}

module.exports = { createSender };
