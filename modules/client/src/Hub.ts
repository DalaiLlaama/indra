import * as eth from 'ethers'

import { Networking } from './lib/networking'
import {
  Address,
  BN,
  ChannelRow,
  ChannelState,
  ChannelStateUpdate,
  channelUpdateToUpdateRequest,
  CustodialBalanceRow,
  CustodialWithdrawalRow,
  ExchangeRates,
  HubConfig,
  Payment,
  PaymentProfileConfig,
  PurchasePayment,
  PurchasePaymentHubResponse,
  PurchasePaymentRow,
  PurchaseRowWithPayments,
  SignedDepositRequestProposal,
  Sync,
  ThreadRow,
  ThreadState,
  ThreadStateUpdate,
  UpdateRequest,
  WithdrawalParameters,
} from './types'
import { Wallet } from './Wallet'

/*********************************
 ****** CONSTRUCTOR TYPES ********
 *********************************/

export interface IHubAPIClient {
  authChallenge(): Promise<string>
  authResponse(nonce: string, address: string, signature: string): Promise<string>
  buy<PurchaseMetaType = any, PaymentMetaType = any>(
    meta: PurchaseMetaType, payments: Array<PurchasePayment<PaymentMetaType>>,
  ): Promise<PurchasePaymentHubResponse>
  config(): Promise<HubConfig>
  getActiveThreads(): Promise<ThreadState[]>
  getAllThreads(): Promise<ThreadState[]>
  getAuthStatus(): Promise<{ success: boolean, address?: Address }>
  getAuthToken(): Promise<string>
  getChannel(): Promise<ChannelRow>
  getChannelByUser(user: Address): Promise<ChannelRow>
  getChannelStateAtNonce(txCountGlobal: number): Promise<ChannelStateUpdate>
  getCustodialBalance(): Promise<CustodialBalanceRow | undefined>
  getExchangeRates(): Promise<ExchangeRates>
  getIncomingThreads(): Promise<ThreadRow[]>
  getLastThreadUpdateId(): Promise<number>
  getLatestChannelStateAndUpdate(
  ): Promise<{ state: ChannelState, update: UpdateRequest } | undefined>
  getLatestStateNoPendingOps(): Promise<ChannelState | undefined>
  getPaymentById(id: string): Promise<PurchaseRowWithPayments<object, string>>
  getPaymentHistory(): Promise<PurchasePaymentRow[]>
  getProfileConfig(): Promise<PaymentProfileConfig | undefined>
  getThreadByParties(partyB: Address, userIsSender: boolean): Promise<ThreadRow>
  getThreadInitialStates(): Promise<ThreadState[]>
  redeem(
    secret: string, txCount: number, lastThreadUpdateId: number,
  ): Promise<PurchasePaymentHubResponse & { amount: Payment }>
  requestCollateral(txCountGlobal: number): Promise<Sync>
  requestCustodialWithdrawal(
    amountToken: BN, recipient: Address,
  ): Promise<CustodialWithdrawalRow | undefined>
  requestDeposit(
    deposit: SignedDepositRequestProposal, txCount: number, lastThreadUpdateId: number,
  ): Promise<Sync>
  requestExchange(weiToSell: string, tokensToSell: string, txCountGlobal: number): Promise<Sync>
  requestWithdrawal(withdrawal: WithdrawalParameters, txCountGlobal: number): Promise<Sync>
  startProfileSession(): Promise<void>
  sync(txCountGlobal: number, lastThreadUpdateId: number): Promise<Sync | undefined>
  updateHub(
    updates: UpdateRequest[],
    lastThreadUpdateId: number,
  ): Promise<{ error: string | undefined, updates: Sync }>
  updateThread(update: ThreadStateUpdate): Promise<ThreadStateUpdate>
}

export class HubAPIClient implements IHubAPIClient {
  private networking: Networking
  private wallet: Wallet
  private authToken?: string

  public constructor(networking: Networking, wallet: Wallet) {
    this.networking = networking
    this.wallet = wallet
  }

  public async requestCustodialWithdrawal(
    amountToken: BN, recipient: Address,
  ): Promise<CustodialWithdrawalRow | undefined> {
    try {
      const res = (await this.networking.post(
        `custodial/withdrawals`, {
          amountToken: amountToken.toString(),
          recipient,
        },
      )).data
      return res ? res : undefined
    } catch (e) {
      if (e.status === 404) {
        console.log(`No custodial withdrawals available for: ${this.wallet.address}`)
        return undefined
      }
      console.log(`Error creating a custodial withdrawal for ${this.wallet.address}:`, e)
      throw e
    }
  }

  public async getProfileConfig(): Promise<PaymentProfileConfig | undefined> {
    try {
      const res: PaymentProfileConfig | undefined = (await this.networking.post(
        `profile/user/${this.wallet.address}`, {
          authToken: await this.getAuthToken(),
        },
      )).data
      return res ? res : undefined
    } catch (e) {
      if (e.status === 404) {
        console.log(`No payment profile set for user: ${this.wallet.address}`)
        return undefined
      }
      console.log(`Error getting the payment profile config for ${this.wallet.address}:`, e)
      throw e
    }
  }

  public async startProfileSession(): Promise<void> {
    throw new Error('Implement startProfileSession on the hub and client properly.')
  }

  public async getCustodialBalance(): Promise<CustodialBalanceRow | undefined> {
    try {
      const res: CustodialBalanceRow | undefined = (await this.networking.post(
        `custodial/${this.wallet.address}/balance`, {
          authToken: await this.getAuthToken(),
        },
      )).data
      return res ? res : undefined
    } catch (e) {
      if (e.status === 404) {
        console.log(`Custodial balances not found for user ${this.wallet.address}`)
        return undefined
      }
      console.log('Error getting custodial balance:', e)
      throw e
    }
  }

  public async config(): Promise<HubConfig> {
    const res = (await this.networking.get(`config`)).data
    return res ? res : undefined
  }

  public async authChallenge(): Promise<string> {
    const res = (await this.networking.post(`auth/challenge`, {})).data
    return res && res.nonce ? res.nonce : undefined
  }

  public async authResponse(
    nonce: string,
    address: string,
    signature: string,
  ): Promise<string> {
    const res = (await this.networking.post(`auth/response`, {
      address,
      nonce,
      signature,
    })).data
    return res && res.token ? res.token : undefined
  }

  public async getAuthStatus(): Promise<{ success: boolean, address?: Address }> {
    const res = (await this.networking.post(`auth/status`, {
      authToken: this.authToken,
    })).data
    return res ? res : { success: false }
  }

  public async getAuthToken(): Promise<string> {
    // if we already have an auth token that works, return it
    const status = await this.getAuthStatus()
    if (
      this.authToken
      && status.success
      && status.address
      && status.address.toLowerCase() === this.wallet.address
    ) {
      return this.authToken
    }
    console.log(`Getting a new auth token, current one is invalid: ${this.authToken}`)

    // reset authtoken
    const nonce = await this.authChallenge()

    // create hash and sign
    const signature = await this.wallet.signMessage(nonce)

    // set auth token
    this.authToken = await this.authResponse(nonce, this.wallet.address, signature)

    return this.authToken
  }

  public async getLatestStateNoPendingOps(): Promise<ChannelState | undefined> {
    try {
      const res = (await this.networking.post(`channel/${this.wallet.address}/latest-no-pending`, {
        authToken: await this.getAuthToken(),
      })).data
      return res ? res : undefined
    } catch (e) {
      if (e.status === 404) {
        console.log(`Channel not found for user ${this.wallet.address}`)
        return undefined
      }
      console.log('Error getting latest state no pending ops:', e)
      throw e
    }
  }

  public async getLastThreadUpdateId(): Promise<number> {
    try {
      const res = (await this.networking.post(`thread/${this.wallet.address}/last-update-id`, {
        authToken: await this.getAuthToken(),
      })).data
      return res && res.latestThreadUpdateId ? res.latestThreadUpdateId : 0
    } catch (e) {
      if (e.status === 404) {
        console.log(`Thread update not found for user ${this.wallet.address}`)
        return 0
      }
      console.log('Error getting latest state no pending ops:', e)
      throw e
    }
  }

  public async getLatestChannelStateAndUpdate(
  ): Promise<{state: ChannelState, update: UpdateRequest} | undefined> {
    try {
      const res = (await this.networking.post(`channel/${this.wallet.address}/latest-update`, {
        authToken: await this.getAuthToken(),
      })).data
      return res && res.state
        ? { state: res.state, update: channelUpdateToUpdateRequest(res) }
        : undefined
    } catch (e) {
      if (e.status === 404) {
        console.log(`Channel not found for user ${this.wallet.address}`)
        return undefined
      }
      console.log('Error getting latest state:', e)
      throw e
    }
  }

  // 'POST /:sender/to/:receiver/update': 'doUpdateThread'
  public async updateThread(update: ThreadStateUpdate): Promise<ThreadStateUpdate> {
    try {
      const res = (await this.networking.post(
        `thread/${update.state.sender}/to/${update.state.receiver}/update`,
        {
          authToken: await this.getAuthToken(),
          update,
        },
      )).data
      return res ? res : undefined
    } catch (e) {
      if (e.statusCode === 404) {
        throw new Error(
          `Thread not found for sender ${update.state.sender
          } and receiver ${update.state.receiver}`,
        )
      }
      throw e
    }
  }

  // get the current channel state and return it
  public async getChannelByUser(user: Address): Promise<ChannelRow> {
    try {
      const res = (await this.networking.post(`channel/${user}`, {
        authToken: await this.getAuthToken(),
      })).data
      return res ? res : undefined
    } catch (e) {
      if (e.statusCode === 404) {
        throw new Error(`Channel not found for user ${user}`)
      }
      throw e
    }
  }

  public async getChannel(): Promise<ChannelRow> {
    return this.getChannelByUser(this.wallet.address)
  }

  // return channel state at specified global nonce
  public async getChannelStateAtNonce(
    txCountGlobal: number,
  ): Promise<ChannelStateUpdate> {
    try {
      const res = (await this.networking.post(
        `channel/${this.wallet.address}/update/${txCountGlobal}`,
        { authToken: await this.getAuthToken() },
      )).data
      return res ? res : undefined
    } catch (e) {
      throw new Error(
        `Cannot find update for user ${this.wallet.address
        } at nonce ${txCountGlobal}, ${e.toString()}`,
      )
    }
  }

  // get the current channel state and return it
  public async getThreadInitialStates(): Promise<ThreadState[]> {
    const res = (await this.networking.post(`thread/${this.wallet.address}/initial-states`, {
      authToken: await this.getAuthToken(),
    })).data
    return res ? res : []
  }

  // get the current channel state and return it
  public async getActiveThreads(): Promise<ThreadState[]> {
    const res = (await this.networking.post(`thread/${this.wallet.address}/active`, {
      authToken: await this.getAuthToken(),
    })).data
    return res ? res : []
  }

  // get the current channel state and return it
  public async getAllThreads(): Promise<ThreadState[]> {
    const res = (await this.networking.post(`thread/${this.wallet.address}/all`, {
      authToken: await this.getAuthToken(),
    })).data
    return res ? res : []
  }

  // get the current channel state and return it
  public async getIncomingThreads(): Promise<ThreadRow[]> {
    const res = (await this.networking.post(`thread/${this.wallet.address}/incoming`, {
      authToken: await this.getAuthToken(),
    })).data
    return res ? res : []
  }

  // return all threads between 2 addresses
  public async getThreadByParties(
    partyB: Address,
    userIsSender: boolean,
  ): Promise<ThreadRow> {
    // get receiver threads
    const res = (await this.networking.post(
      `thread/${userIsSender ? this.wallet.address : partyB
      }/to/${userIsSender ? partyB : this.wallet.address}`,
      { authToken: await this.getAuthToken() },
    )).data
    return res ? res : undefined
  }

  // hits the hubs sync endpoint to return all actionable states
  public async sync(
    txCountGlobal: number,
    lastThreadUpdateId: number,
  ): Promise<Sync | undefined> {
    try {
      const res = (await this.networking.post(
        `channel/${this.wallet.address}/sync?lastChanTx=${txCountGlobal
        }&lastThreadUpdateId=${lastThreadUpdateId}`,
        { authToken: await this.getAuthToken() },
      )).data
      return res ? res : undefined
    } catch (e) {
      if (e.status === 404) {
        return undefined
      }
      throw e
    }
  }

  public async getExchangeRates(): Promise<ExchangeRates> {
    const res = (await this.networking.get('exchangeRate')).data
    return res && res.rates ? res.rates : undefined
  }

  public async getPaymentHistory(): Promise<PurchasePaymentRow[]> {
    const { data } = await this.networking.post(`payments/history/${this.wallet.address}`, {
      authToken: await this.getAuthToken(),
    })
    return data ? data : undefined
  }

  public async getPaymentById(id: string): Promise<PurchaseRowWithPayments<object, string>> {
    const { data } = await this.networking.post(`payments/purchase/${id}`, {
      authToken: await this.getAuthToken(),
    })
    return data ? data : undefined
  }

  public async buy<PurchaseMetaType=any, PaymentMetaType=any>(
    meta: PurchaseMetaType,
    payments: Array<PurchasePayment<any, any>>,
  ): Promise<PurchasePaymentHubResponse> {
    try {
      const res = (await this.networking.post('payments/purchase', {
        authToken: await this.getAuthToken(),
        meta,
        payments,
      })).data
      return res ? res : undefined
    } catch (e) {
      throw e
    }
  }

  public async redeem(
    secret: string,
    txCount: number,
    lastThreadUpdateId: number,
  ) : Promise<PurchasePaymentHubResponse & { amount: Payment}> {
    try {
      const res = (await this.networking.post(`payments/redeem/${this.wallet.address}`, {
        authToken: await this.getAuthToken(),
        lastChanTx: txCount,
        lastThreadUpdateId,
        secret,
      })).data
      return res ? res : undefined
    } catch (e) {
      console.log(e.message)
      if (e.message.indexOf('Payment has been redeemed.') !== -1) {
        throw new Error(`Payment has been redeemed.`)
      }
      throw e
    }
  }

  // post to hub telling user wants to deposit
  public async requestDeposit(
    deposit: SignedDepositRequestProposal,
    txCount: number,
    lastThreadUpdateId: number,
  ): Promise<Sync> {
    if (!deposit.sigUser) {
      throw new Error(
        `No signature detected on the deposit request. Deposit: ${deposit
        }, txCount: ${txCount}, lastThreadUpdateId: ${lastThreadUpdateId}
      `)
    }
    const res = (await this.networking.post(`channel/${this.wallet.address}/request-deposit`, {
      authToken: await this.getAuthToken(),
      depositToken: deposit.amountToken,
      depositWei: deposit.amountWei,
      lastChanTx: txCount,
      lastThreadUpdateId,
      sigUser: deposit.sigUser,
    })).data
    return res ? res : undefined
  }

  // post to hub telling user wants to withdraw
  public async requestWithdrawal(
    withdrawal: WithdrawalParameters,
    txCountGlobal: number,
  ): Promise<Sync> {
    const res = (await this.networking.post(`channel/${this.wallet.address}/request-withdrawal`, {
      authToken: await this.getAuthToken(),
      lastChanTx: txCountGlobal,
      ...withdrawal,
    })).data
    return res ? res : undefined
  }

  public async requestExchange(
    weiToSell: string,
    tokensToSell: string,
    txCountGlobal: number,
  ): Promise<Sync> {
    const res = (await this.networking.post(`channel/${this.wallet.address}/request-exchange`, {
      authToken: await this.getAuthToken(),
      lastChanTx: txCountGlobal,
      tokensToSell,
      weiToSell,
    })).data
    return res ? res : undefined
  }

  // performer calls this when they wish to start a show
  // return the proposed deposit fro the hub which should then be verified and cosigned
  public async requestCollateral(txCountGlobal: number): Promise<Sync> {
    const res = (await this.networking.post(
      `channel/${this.wallet.address}/request-collateralization`,
      {
        authToken: await this.getAuthToken(),
        lastChanTx: txCountGlobal,
      },
    )).data
    return res ? res : undefined
  }

  // post to hub to batch verify state updates
  public async updateHub(
    updates: UpdateRequest[],
    lastThreadUpdateId: number,
  ): Promise<{ error: string | undefined, updates: Sync }> {
    const res = (await this.networking.post(`channel/${this.wallet.address}/update`, {
      authToken: await this.getAuthToken(),
      lastThreadUpdateId,
      updates,
    })).data
    return res ? res : undefined
  }

}
