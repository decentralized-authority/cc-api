import AWS from 'aws-sdk';
import isString from 'lodash/isString';

export class SecretManager {

  _secretsManager: AWS.SecretsManager;

  constructor() {
    this._secretsManager = new AWS.SecretsManager();
  }

  async createSecret(secretName: string, secretValue: string, description?: string): Promise<AWS.SecretsManager.CreateSecretResponse> {
    const params: AWS.SecretsManager.CreateSecretRequest = {
      Name: secretName,
      SecretString: secretValue
    };
    if(description && isString(description))
      params.Description = description;
    return await this._secretsManager.createSecret(params).promise();
  }

  async getSecret(secretName: string): Promise<AWS.SecretsManager.GetSecretValueResponse> {
    const params: AWS.SecretsManager.GetSecretValueRequest = {
      SecretId: secretName
    };
    return await this._secretsManager.getSecretValue(params).promise();
  }

}
