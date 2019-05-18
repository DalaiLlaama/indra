import { ConnextState } from '../state/store'
import { Payment, convertChannelState, convertPayment, convertCustodialBalanceRow } from '../types'

export function getCustodialAndChannelBalance(state: ConnextState): Payment {
  const { persistent } = state
  const channel = convertChannelState("bn", persistent.channel)
  const custodial = convertCustodialBalanceRow("bn", persistent.custodialBalance)

  const total = {
    amountWei: custodial.balanceWei.add(
      channel.balanceWeiUser
    ),
    amountToken: custodial.balanceToken.add(
      channel.balanceTokenUser
    )
  }
  
  return convertPayment("str", total)
}
