import crypto from 'crypto';
import { generateSalt } from './util';

export interface EncryptedObject {
  algorithm: string
  keylen: number
  salt: string
  iv: string
  encrypted: string
}

export class EncryptionManager {

  _encryptionPass: string;

  constructor(encryptionPass: string) {
    this._encryptionPass = encryptionPass;
  }

  encrypt(clearText: string): string {
    const password = this._encryptionPass;
    const salt = generateSalt();
    const keylen = 32;
    const algorithm = 'aes-256-cbc';
    const iv = generateSalt();
    const key = crypto.scryptSync(
      Buffer.from(password, 'utf8'),
      Buffer.from(salt, 'hex'),
      keylen,
    );
    const cipher = crypto
      .createCipheriv(
        algorithm,
        key,
        Buffer.from(iv, 'hex'),
      );
    let encrypted = cipher.update(clearText, 'utf8', 'hex');
    encrypted = encrypted + cipher.final('hex');
    const encryptedObj: EncryptedObject = {algorithm, keylen, salt, iv, encrypted};
    return JSON.stringify(encryptedObj);
  }

  decrypt(encryptedJson: string): string {
    const password = this._encryptionPass;
    const { algorithm, keylen, salt, iv, encrypted } = JSON.parse(encryptedJson) as EncryptedObject;
    const key = crypto.scryptSync(
      Buffer.from(password, 'utf8'),
      Buffer.from(salt, 'hex'),
      keylen,
    );
    const decipher = crypto.createDecipheriv(
      algorithm,
      key,
      Buffer.from(iv, 'hex'),
    );
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

}
