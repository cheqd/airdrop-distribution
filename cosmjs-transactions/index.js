import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing'
import { assertIsDeliverTxSuccess, SigningStargateClient } from '@cosmjs/stargate'
import asyncPool from 'tiny-async-pool'

const MINIMAL_DENOM = 10**9
const MINIMAL_DENOM_LITERAL = 'ncheq'
const MAINNET_BLOCK_EXPLORER = 'https://explorer.cheqd.io'
const FEE = {
  amount: [
    {
      denom: 'ncheq',
      amount: '3000000'
    },
  ],
  gas: '100000'
}

const NUMBER_OF_DISTRIBUTORS = 2
const mnemonics = [
  process.env.CF_DISTRIBUTOR_1_MNEMONIC,
  process.env.CF_DISTRIBUTOR_2_MNEMONIC,
]

addEventListener('scheduled', event => {
  event.waitUntil(handleScheduled(event));
})

async function handleScheduled(event) {
  await process_queue()
}

async function process_queue() {
  const list = await list_pending_transactions()

  return process_transactions( list )
}

async function list_pending_transactions() {
  return ( await withdrawal_transactions_queue.list() ).keys
}

async function process_transactions(keys) {
  let transactions = []

  for( let [i, key] of keys.entries() ){
    const recipient = key.name
    const pending_transaction = JSON.parse( await withdrawal_transactions_queue.get( recipient ) )

    transactions.push(
      {
        recipient: recipient,
        amount: pending_transaction.amount,
        assigned_to_distributor: transactions.length
      }
    )

    if( ( i + 1 ) % NUMBER_OF_DISTRIBUTORS === 0 ){
      const tx_hashes = await process_pool( transactions )

      transactions.length = 0
    }
  }

  return true
}

async function process_pool(transactions) {
  return await asyncPool(
    NUMBER_OF_DISTRIBUTORS,
    transactions,
    execute_transactional_logic
  )
}

async function execute_transactional_logic(transaction) {
  return new Promise(
    async function(resolve){
      const { recipient, amount, assigned_to_distributor } = transaction
      const { tx_hash } = await broadcast_tx( recipient, amount, assigned_to_distributor )

      await enlist_successful_withdrawal( recipient, tx_hash, amount )

      await delete_processed_enqueued_transaction( recipient )

      resolve( tx_hash )
    }
  )
}

async function enlist_successful_withdrawal(address, tx_hash, amount) {
  const date = new Date()
  let entry = JSON.parse( await community_airdrop.get( address ) )
  const diff = Number( entry.reward ) - Number( amount )

  entry.reward = Number( entry.reward ) - Number( amount ) > 0 ? diff : 0 

  entry.withdrawals.successful_withdrawals.push(
    {
      amount: amount,
      tx_hash: tx_hash,
      tx_explorer_link: `${MAINNET_BLOCK_EXPLORER}/transactions/${tx_hash}`,
      timestamp: date.getTime(),
      human_readable_date: date.toISOString()
    }
  )

  await community_airdrop.put( 
    address,
    JSON.stringify(
      entry
    )
  )

  return true
}

async function delete_processed_enqueued_transaction(address) {
  await withdrawal_transactions_queue.delete( address )

  return true
}

async function broadcast_tx(recipient, amount_in_maximal_denom, distributor_number) {
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic( mnemonics[ distributor_number ], { prefix: 'cheqd' } )

  const [ account ] = await wallet.getAccounts()

  const client = await SigningStargateClient.connectWithSigner( RPC_ENDPOINT, wallet )

  const amount = {
    denom: MINIMAL_DENOM_LITERAL,
    amount: String( Number( amount_in_maximal_denom ) * MINIMAL_DENOM )
  }

  const result = await client.sendTokens(
    account.address,
    recipient,
    [ amount ],
    FEE,
  )

  assertIsDeliverTxSuccess( result )

  return {
    tx_hash: result.transactionHash
  }
}
