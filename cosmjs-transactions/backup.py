import subprocess
import json

_keys = subprocess.run( [ 'wrangler', 'kv:key', 'list', '--binding', 'withdrawal_transactions_queue' ], shell=True, stdout=subprocess.PIPE )
keys = _keys.stdout.decode( 'utf-8' )

with open( '_backup.json', 'w', encoding='utf-8' ) as b:
    b.write( keys )

print( 'Written to _backup.json. Exiting.' )

exit(0)
