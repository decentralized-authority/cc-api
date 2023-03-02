import dynogels from 'dynogels';
import Joi from 'joi';

export const createGatewayModel = (tableName: string) => dynogels.define('Gateway', {
  hashKey: 'id',
  indexes: [
    {name: 'provider-id-index', hashKey: 'provider', rangeKey: 'id', type: 'global'},
  ],
  tableName,
  timestamps: true,
  schema: {
    // @ts-ignore
    id: Joi.string(),
    // @ts-ignore
    region: Joi.string(),
    // @ts-ignore
    provider: Joi.string(),
    // @ts-ignore
    address: Joi.string(),
    // @ts-ignore
    privateAddress: Joi.string(),
    // @ts-ignore
    statsUser: Joi.string(),
    // @ts-ignore
    statsPass: Joi.string(),
    // @ts-ignore
    httpPort: Joi.number(),
    // @ts-ignore
    apiPort: Joi.number(),
    // @ts-ignore
    statsPort: Joi.number(),
    // @ts-ignore
    controlPort: Joi.number(),
    // @ts-ignore
    serverStartingHttpPort: Joi.number(),
    // @ts-ignore
    serverStartingApiPort: Joi.number(),
    // @ts-ignore
    serverStartingStatsPort: Joi.number(),
    // @ts-ignore
    serverStartingControlPort: Joi.number(),
    // @ts-ignore
    relayPort: Joi.number(),
    // @ts-ignore
    discordWebhookUrl: Joi.string(),
  },
});
