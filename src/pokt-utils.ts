import request from 'superagent';
import * as math from 'mathjs';

export interface PoktQueryNodeResponse {
  address: string
  chains: string[]
  jailed: boolean
  public_key: string
  service_url: string
  status: number
  tokens: string
  unstaking_time: string
}

export class PoktUtils {

  _endpoint: string;

  constructor(endpoint: string) {
    this._endpoint = endpoint;
  }

  async _makeRequest(func: ()=>Promise<any>) {
    const funcs: (()=>Promise<any>)[] = new Array(3).fill(async () => {
      try {
        return await func();
      } catch(err) {
        return null;
      }
    });
    const resArr = await Promise.all(funcs.map(f => f()));
    const counts: Map<string, number> = new Map();
    for(const res of resArr) {
      let encoded: string;
      try {
        encoded = JSON.stringify(res.body);
      } catch(err) {
        encoded = JSON.stringify(null);
      }
      const count = counts.get(encoded) || 0;
      counts.set(encoded, count + 1);
    }
    const sorted = [...counts.entries()]
      .sort((a, b) => {
        const countA = a[1];
        const countB = b[1];
        return countA === countB ? 0 : countA > countB ? -1 : 1;
      })
      .map(([key, val]) => key);
    return JSON.parse(sorted[0]);
  }

  async getBalance(address: string): Promise<string> {
    try {
      const res = await this._makeRequest(() => request
        .post(`${this._endpoint}/v1/query/balance`)
        .timeout(5000)
        .send({
          address,
          height: 0,
        }));
      const { balance = '0' } = res;
      return math.divide(
        math.bignumber(balance),
        math.bignumber(1000000)
      ).toString();
    } catch(err) {
      return '0';
    }
  }

  async getNode(address: string): Promise<PoktQueryNodeResponse|null> {
    try {
      const res = await this._makeRequest(() => request
        .post(`${this._endpoint}/v1/query/node`)
        .timeout(5000)
        .send({
          address,
          height: 0,
        }));
      return res && !res.error ? res : null;
    } catch(err) {
      return null;
    }
  }

}
