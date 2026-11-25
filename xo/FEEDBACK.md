# Developing with XO: feedback

*Written by aquarush for the BCH BLAZE 2026 Migrate to XO and Build with XO bounties.*

I was totally new to XO until I joined the hackathon and learnt more about it. When opening the template for the first time, the structure really amused me with the clearly laid out outputs.

But this still didn't make me sure what the unlock script was for. Then I migrated the Unlock purchase to an XO template. The original app had a buyer make the payment that pays the seller with a 3% fee for the receipt minter and tags every transaction with a UNLK followed by item and nonce, but in the XO version, the seller creates the invitation with the item sets along with other variants and the buyer joins and adds their checkout code, and signs. Similarly the original Unlock server also accepted the XO-built transaction and rejected it when a wrong nonce was supplied as it was supposed to.

I also liked the concept of seller/buyer split where nobody shares the keys, and the follow-up of withdraw action only took a few lines in the template. Also the silent wrong bytes issue was worrying. Writing the tag output as inline expression produced garbage with no error because XO read the result as a text instead of bytes, which is really dangerous for a payment system. Also the docs setup example crashes with SQLite Storage which I found while building so I had to switch to IndexedDB. Also there are no docs on how recovery works.

I hope the silent bytes bug is solved and the docs are updated to a working storage config. As a beginner who has great capability to leverage the use of AI, I'd want a concrete example of a two-role template where one output requires data from a specific role. The multi-party model fits sales and escrow well, I'd use it for deals where two people need to build one transaction without trusting each other.

Full technical notes, versions and reproduction steps: [`NOTES.md`](NOTES.md)
