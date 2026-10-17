// Apify Actor entry point.
//  - Standby (APIFY_META_ORIGIN=STANDBY): MCP over streamable HTTP at /mcp; one `fee-calculation` event per calculation call.
//  - Standard run: batch mode from the Actor input (see .actor/input_schema.json); results go to the default dataset.
import { Actor, log } from 'apify';
import { createHttpApp, listen } from './http';
import { apifyBiller } from './billing';
import { runBatch, type BatchInput } from './batch';
import { SERVER_NAME, SERVER_VERSION } from './meta';

await Actor.init();
const standby = Actor.config.get('metaOrigin') === 'STANDBY';

if (standby) {
  const biller = apifyBiller(Actor, (m, d) => log.warning(m, d), () => Actor.getChargingManager().getPricingInfo().isPayPerEvent);
  const port = Actor.config.get('containerPort') as number;
  const server = await listen(createHttpApp({ biller, log: (m, d) => log.error(m, d) }), port);
  log.info(`${SERVER_NAME} ${SERVER_VERSION}: MCP server listening on port ${port} at /mcp`);
  const shutdown = async () => { server.close(); await Actor.exit(); };
  Actor.on('aborting', shutdown); Actor.on('migrating', shutdown);
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
  process.on('uncaughtException', async e => { log.exception(e as Error, 'Fatal error, exiting so the platform starts a fresh run'); await Actor.exit({ exitCode: 1 }); });
} else {
  const pricing = Actor.getChargingManager().getPricingInfo();
  if (pricing.isPayPerEvent && 'apify-default-dataset-item' in pricing.perEventPrices)
    log.warning('The synthetic "apify-default-dataset-item" event is enabled, so every dataset item is ALSO charged on top of "fee-calculation". Remove it in Publishing > Monetization.');
  const input = await Actor.getInput<BatchInput>();
  const r = await runBatch(Actor, input);
  if (r.error) await Actor.fail(r.error);
  else await Actor.exit(r.failed && !r.ok ? { exitCode: 0, statusMessage: 'All calls were rejected; see the dataset for the reasons.' } : undefined);
}
