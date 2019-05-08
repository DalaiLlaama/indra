import { default as DBEngine } from '../DBEngine'
import { default as Config } from '../Config'
import { default as log } from '../util/log'
import { CustodialPaymentsDao } from './CustodialPaymentsDao'
import { default as ExchangeRateDao } from '../dao/ExchangeRateDao'
import { OnchainTransactionService } from '../OnchainTransactionService'
import { BigNumber } from 'ethers/utils'
import { Utils, types } from 'connext'
const { assetToWei, toWeiString } = new Utils()

type CustodialWithdrawalRowBN = types.CustodialWithdrawalRowBN

const LOG = log('CustodialPaymentsService')

export interface CreateCustodialWithdrawalArgs {
  user: string
  recipient: string
  amountToken: BigNumber
}

export class CustodialPaymentsService {
  MIN_WITHDRAWAL_AMOUNT_TOKEN = toWeiString('0.1')

  constructor(
    private config: Config,
    private db: DBEngine,
    private exchangeRates: ExchangeRateDao,
    private dao: CustodialPaymentsDao,
    private onchainTxnService: OnchainTransactionService,
  ) {}

  async createCustodialWithdrawal(args: CreateCustodialWithdrawalArgs): Promise<CustodialWithdrawalRowBN> {
    return this.db.withTransaction(() => this._createCustodialWithdrawal(args))
  }

  async _createCustodialWithdrawal(args: CreateCustodialWithdrawalArgs): Promise<CustodialWithdrawalRowBN> {
    const { user, amountToken, recipient } = args
    if (amountToken.lt(this.MIN_WITHDRAWAL_AMOUNT_TOKEN)) {
      // Note: this will also be checked by a trigger on the withdrawals table
      throw new Error(
        `Attempt by ${user} to withdraw <= ${this.MIN_WITHDRAWAL_AMOUNT_TOKEN} tokens. ` +
        `Requested amount: ${amountToken.toString()}.`
      )
    }

    const balance = await this.dao.getCustodialBalance(user)
    if (balance.balanceToken.lt(amountToken)) {
      // Note: this will also be checked by a trigger on the withdrawals table
      throw new Error(
        `Attempt by ${user} to withdraw more than their balance. ` +
        `Requested amount: ${amountToken.toString()}, ` +
        `balance: ${balance.balanceToken.toString()}.`
      )
    }

    const exchangeRate = await this.exchangeRates.getLatestUsdRate()
    const [amountWei, remainder] = assetToWei(amountToken, exchangeRate)
    const txn = await this.onchainTxnService.sendTransaction(this.db, {
      from: this.config.hotWalletAddress,
      to: recipient,
      value: amountWei.toString(),
      meta: { reason: 'custodial withdrawal' },
    })

    return await this.dao.createCustodialWithdrawal({
      user,
      recipient,
      requestedToken: amountToken,
      exchangeRate,
      sentWei: amountWei,
      onchainTransactionId: txn.id,
    })
  }
}
