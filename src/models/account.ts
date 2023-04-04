import dynogels from 'dynogels';
import Joi from 'joi';

export const createAccountModel = (tableName: string) => dynogels.define('Account', {
  hashKey: 'id',
  tableName,
  timestamps: true,
  schema: {
    // @ts-ignore
    id: Joi.string(),
    // @ts-ignore
    email: Joi.string().email(),
    // @ts-ignore
    salt: Joi.string(),
    // @ts-ignore
    passwordHash: Joi.string(),
    // @ts-ignore
    domains: Joi.string(),
    // @ts-ignore
    poktAddress: Joi.string(),
    // @ts-ignore
    chainSalt: Joi.string(),
    // @ts-ignore
    isPartner: Joi.boolean(), // indicates that this is a partner account, not a regular user account
    // @ts-ignore
    agreeTos: Joi.boolean(),
    // @ts-ignore
    agreeTosDate: Joi.string(),
    // @ts-ignore
    agreePrivacyPolicy: Joi.boolean(),
    // @ts-ignore
    agreePrivacyPolicyDate: Joi.string(),
    // @ts-ignore
    agreeCookies: Joi.boolean(),
    // @ts-ignore
    agreeCookiesDate: Joi.string(),
    // @ts-ignore
    chains: Joi.string(),
  },
});
