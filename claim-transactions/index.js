const BASE_NETWORK = 'cheqd'

const NETWORKS = {
  cosmos:   'https://lcd-cosmoshub.blockapsis.com',
  cheqd:    'https://api.cheqd.net',
  osmo:     'https://lcd-osmosis.blockapsis.com',
  juno:     'https://lcd-juno.itastakers.com'
}

const HEADERS = {
  json: { 'Content-Type': 'application/json' },
  text: { 'Content-Type': 'text/plain' },
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Max-Age': '86400'
}

const MESSAGES = {
  invalid: 'Invalid address provided or not qualified for this stage of the airdrop.',
  valid: 'Thank you for participating on this round! Your transaction will be processed in the next 24 hours.',
  withdrawal: 'You have already submitted a withdrawal request. Please note that due to the volume of distributions to be carried out, it might take a few hours for the CHEQ tokens to be in your wallet. You can check the balance of your wallet on our block explorer.'
}

const WITHDRAWAL_QUEUES = {
  'queue-1': withdrawal_queue_test,
  /* 'queue-2': withdrawal_queue_1,
  'queue-3': withdrawal_queue_2, */
}

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})
/**
 * Respond with '/', '/calculate/<address>', '/claim/<address>'
 * @param {Request} request
 */
async function handleRequest(request) {
  const url = parse_url_to_base_class(request.url)
  const route = url.pathname
  const address = url.pathname.replace('/claim/','').replace('/calculate/','').replace('/','')

  if( !address || !validate_address( address ) || await is_denied( address ) || !( await is_qualified( address ) ) ) return new Response( JSON.stringify( { valid: false, withdrawn: false, message: MESSAGES.invalid } ), { headers: { ...CORS_HEADERS, ...HEADERS.json } } )

  if( RegExp( 'calculate' ).test( route ) ) {
    const calculate = await calculate_eligible( address )

    if( !calculate ) return new Response( JSON.stringify( { valid: false, message: MESSAGES.invalid } ), { headers: { ...CORS_HEADERS, ...HEADERS.json } } )

    const withdrawal = await has_submitted_a_withdrawal( address )

    if( withdrawal ) return new Response( JSON.stringify( { valid: true, withdrawn: true, message: MESSAGES.withdrawal } ), { headers: { ...CORS_HEADERS, ...HEADERS.json } } )

    return new Response(
      JSON.stringify(
        {
          valid: true,
          withdrawn: false,
          breakdown: calculate
        }
      ),
      {
        headers: { ...CORS_HEADERS, ...HEADERS.json }
      }
    )
  }

  const withdrawal = await has_submitted_a_withdrawal( address )

  if( withdrawal ) return new Response( JSON.stringify( { valid: true, withdrawn: true, message: MESSAGES.withdrawal } ), { headers: { ...CORS_HEADERS, ...HEADERS.json } } )

  const claim = await process_claim( address )

  if( !claim ) return new Response( JSON.stringify( { valid: false, withdrawn: false, message: MESSAGES.invalid } ), { headers: { ...CORS_HEADERS, ...HEADERS.json } } )

  return new Response(
    JSON.stringify(
      {
        valid: true,
        withdrawn: true,
        message: MESSAGES.valid
      }
    ),
    {
      headers: { ...CORS_HEADERS, ...HEADERS.json }
    }
  )
}

async function calculate_eligible(address) {
  const entry = await fetch_qualified_entry( address )

  if( !entry || !entry?.entry || !entry?.entry?.breakdown ) return false

  const withdrawn = entry?.entry?.withdrawn
  const pending = entry?.entry?.pending
  const total = entry?.entry?.total

  if( withdrawn + pending >= total ) {
    return { ...entry.entry.breakdown, total: total, withdrawn: withdrawn }
  }

  return { ...entry.entry.breakdown, total: total, withdrawn: withdrawn }
}

async function process_claim(address) {
  let entry = await fetch_qualified_entry( address )

  return await enqueue_transaction( entry.address, entry.entry )
}

function parse_url_to_base_class(url) {
  return new URL(url)
}

async function is_denied(address) {
  const denylist = Object.keys( JSON.parse( await reward_tiers_test.get( 'denylist' ) ) )

  for( let entry of denylist ){
    if( entry === address ) return true
  }

  return false
}

function validate_address(address) {
  for( let n of Object.keys(NETWORKS)){
    if( RegExp(`^(${n})1[a-z0-9]{38}$`).test(address) ) return true
  }
  return false
}

async function validate_account(address) {
  for( let n of Object.keys(NETWORKS)){
    if( RegExp(`^(${n})`).test(address) && ( await fetch_account( address, NETWORKS[ n ] ) )?.account ) return true
  }
  return false
}

function is_base_network(address) {
  if( !RegExp(`^(${BASE_NETWORK})`).test(address) ) return false

  return true
}

async function fetch_account(address, endpoint) {
  return await fetch(
    `${endpoint}/cosmos/auth/v1beta1/accounts/${address}`
  ).then(function(response){
    return response.json()
  }).catch(function(){
    throw new Error('Invalid address provided or unreachable client.')
  })
}

async function is_qualified(address) {
  if( !address ) return false

  if( !is_base_network( address ) ) address = await reward_tiers_test.get( address )

  if( !address ) return false

  return true
}

async function fetch_qualified_entry(address) {
  if( !is_base_network( address ) ) address = await reward_tiers_test.get( address )

  return {
    address: address,
    entry: JSON.parse( await reward_tiers_test.get( address ) )
  }
}

async function has_submitted_a_withdrawal(address) {
  const entry = JSON.parse( await reward_tiers_test.get( address ) )

  const can_withdraw = entry.withdrawn + entry.pending < entry.total

  if( !can_withdraw ) return true

  return false
}

async function enqueue_transaction(address, entry) {
  /* try { */
    const queue = random_queue()
    const amount = Number( entry.total ) - Number( entry.withdrawn )

    await queue.pool.put(
      `${queue.prefix}:${address}`,
      JSON.stringify(
        {
          amount: amount,
          timestamp: (new Date()).getTime()
        }
      )
    )

    entry.pending = amount
    await reward_tiers_test.put(
      address,
      JSON.stringify( entry )
    )
  /* } catch(e) {
    return false
  } */

  return true
}

function random_queue() {
  const pools = Object.keys( WITHDRAWAL_QUEUES )
  const prefix = pools[
    Math.floor(
      Math.random() * pools.length
    )
  ]

  return {
    prefix: prefix,
    pool: WITHDRAWAL_QUEUES[ prefix ]
  }
}
