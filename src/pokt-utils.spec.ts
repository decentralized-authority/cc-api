import 'should';
import { PoktUtils } from './pokt-utils';
import { createPoktAccount, generateId } from './util';
import isNull from 'lodash/isNull';

describe('PoktUtils', function() {

  this.timeout(30000);

  const poktEndpoint = process.env.POKT_ENDPOINT || '';
  let poktUtils: PoktUtils;
  let address: string;

  before(async function() {
    poktUtils = new PoktUtils(poktEndpoint);
    const poktAccount = await createPoktAccount();
    address = poktAccount.address;
  });

  describe('._makeRequest()', function() {
    it('should call a function three times and return the majority response', async function() {
      let runCount = 0;
      const majorityResponse = generateId();
      const responses = [
        majorityResponse,
        generateId(),
        majorityResponse,
      ];
      const res = await poktUtils._makeRequest(async () => {
        const idx = runCount;
        runCount++;
        return {body: responses[idx]};
      });
      runCount.should.equal(3);
      res.should.equal(majorityResponse);
    });
  });

  describe('.getBalance()', function() {
    it('should get the balance of a POKT address', async function() {
      const balance = await poktUtils.getBalance(address);
      balance.should.be.a.String();
      const balanceNum = Number(balance);
      balanceNum.should.be.aboveOrEqual(0);
    });
  });

  describe('.getNode()', function() {
    it('should get a query POKT node response', async function() {
      const node = await poktUtils.getNode(address);
      isNull(node).should.be.True();
    });
  });

});
