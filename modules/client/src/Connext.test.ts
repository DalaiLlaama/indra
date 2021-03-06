import { toBN } from './lib'
import { assert, mkAddress, MockConnextInternal } from './testing'
import { convertCustodialBalanceRow, CustodialBalanceRow, WithdrawalParameters } from './types'

interface CustodialCalculation {
  custodialTokenWithdrawal: string,
  channelTokenWithdrawal: string,
  channelWeiWithdrawal: string,
  custodialWeiWithdrawal: string,
}

describe('Connext', async () => {
  describe('calculateChannelWithdrawal', async () => {
    const createCustodialBalanceRow = (overrides: Partial<CustodialBalanceRow>): any =>
      convertCustodialBalanceRow('bn', {
        balanceToken: '0',
        balanceWei: '0',
        sentWei: '0',
        totalReceivedToken: '0',
        totalReceivedWei: '0',
        totalWithdrawnToken: '0',
        totalWithdrawnWei: '0',
        user: mkAddress('0xRRR'),
        ...overrides,
      })

    // assertion functions
    const assertChannelWithdrawalCalculation = (
      withdrawal: Partial<WithdrawalParameters>,
      custodialOverrides: Partial<CustodialBalanceRow>,
      expected: Partial<CustodialCalculation>,
    ): any => {
      const _withdrawal = {
        exchangeRate: '5',
        ...withdrawal,
      }

      let amountToken = toBN(_withdrawal.tokensToSell || 0)
      amountToken = amountToken.add(_withdrawal.withdrawalTokenUser || 0)

      let amountWei = toBN(_withdrawal.weiToSell || 0)
      amountWei = amountWei.add(_withdrawal.withdrawalWeiUser || 0)

      const _withdrawalSuccinct = {
        amountToken,
        amountWei,
        exchangeRate: '5',
      }

      const custodial = createCustodialBalanceRow(custodialOverrides)
      const ans = new MockConnextInternal()
        .calculateChannelWithdrawal(_withdrawal, custodial)
      const ans2 = new MockConnextInternal()
        .calculateChannelWithdrawal(_withdrawalSuccinct, custodial)

      // values should be consistent if succinct or expanded wd vals given
      assert.deepEqual(ans, ans2)
      // assert they are both as expected
      assert.containSubset(ans, expected)
    }

    it('should withdraw entirely from custodial balance if ' +
       'withdrawal value is less than the custodial owed', async () => {
      const _withdrawal = {
        exchangeRate: '5',
        tokensToSell: '80',
        withdrawalWeiUser: '1',
      }

      const custodial = {
        balanceToken: '100',
        totalReceivedToken: '100',
      }

      assertChannelWithdrawalCalculation(_withdrawal, custodial, {
        channelTokenWithdrawal: '0',
        channelWeiWithdrawal: '1',
        custodialTokenWithdrawal: '80',
        custodialWeiWithdrawal: '0',
      })
    })

    it('should withdraw preferentially from custodial balance if ' +
       'withdrawal value is less than the custodial owed', async () => {
      const _withdrawal = {
        exchangeRate: '5',
        tokensToSell: '120',
        withdrawalWeiUser: '1',
      }

      const custodial = {
        balanceToken: '100',
        totalReceivedToken: '100',
      }

      assertChannelWithdrawalCalculation(_withdrawal, custodial, {
        channelTokenWithdrawal: '20',
        channelWeiWithdrawal: '1',
        custodialTokenWithdrawal: '100',
        custodialWeiWithdrawal: '0',
      })
    })

    it('should work with these specific values, test case for customer support', async () => {
      const _withdrawal = {
        exchangeRate: '258.94',
        tokensToSell: '8003287580000000000000',
        withdrawalWeiUser: '103405366207000000',
      }

      const custodial = {
        balanceToken: '4016900000000000000000',
        totalReceivedToken: '4016900000000000000000',
      }

      assertChannelWithdrawalCalculation(_withdrawal, custodial, {
        channelTokenWithdrawal: '3986387580000000000000',
        channelWeiWithdrawal: '103405366207000000',
        custodialTokenWithdrawal: '4016900000000000000000',
        custodialWeiWithdrawal: '0',
      })
    })
  })
})
