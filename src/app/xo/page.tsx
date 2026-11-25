import { SITE } from "@/lib/site";

export const metadata = { title: "Unlock on XO" };

const GH = `${SITE.repoUrl}/blob/main/xo`;
const TX = "https://chipnet.imaginary.cash/tx/";

type Row = { label: string; href: string; text: string };

const MIGRATE: Row[] = [
  { label: "Template", href: `${GH}/template/unlock.template.json`, text: "unlock.template.json" },
  { label: "Invitation (purchase)", href: `${GH}/invitations/ibUS4RXvCq.purchase.json`, text: "ibUS4RXvCq.purchase.json" },
  { label: "Purchase tx (chipnet)", href: `${TX}a027560fde92d49b9856322db72306b1eb413b1778d7b4eec553624d567c5b03`, text: "a027560f…5b03" },
  { label: "Follow-up invitation (withdraw)", href: `${GH}/invitations/withdraw-30d8aef0.json`, text: "withdraw-30d8aef0.json" },
  { label: "Follow-up tx (chipnet)", href: `${TX}30d8aef0d051da082fe98e7602f0d5296fbb7838d548cb0a1302283fdc617f0c`, text: "30d8aef0…7f0c" },
  { label: "Original project before XO", href: `${SITE.repoUrl}/tree/27a9883`, text: "aquarush/unlock @ 27a9883" },
];

const BUILD: Row[] = [
  { label: "Template", href: `${GH}/template/unlock-split.template.json`, text: "unlock-split.template.json" },
  { label: "Invitation (split purchase)", href: `${GH}/invitations/spLitDemo1.split-purchase.json`, text: "spLitDemo1.split-purchase.json" },
  { label: "Purchase tx (chipnet)", href: `${TX}38a9c9dc6056903ab00f50b294d58f939e6adf53f6a1344f182b666edc8a2d16`, text: "38a9c9dc…2d16" },
  { label: "Follow-up invitation (withdrawShare)", href: `${GH}/invitations/withdraw-share-1377d100.json`, text: "withdraw-share-1377d100.json" },
  { label: "Follow-up tx (chipnet)", href: `${TX}1377d100cd426fed0d6564a49d1e788b5d43dd1458229573b56c3cefc5c30bff`, text: "1377d100…0bff" },
];

function Links({ rows }: { rows: Row[] }) {
  return (
    <ul>
      {rows.map((r) => (
        <li key={r.label}>
          <strong>{r.label}:</strong>{" "}
          <a href={r.href} target="_blank" rel="noreferrer">
            <code>{r.text}</code>
          </a>
        </li>
      ))}
    </ul>
  );
}

export default function XoPage() {
  return (
    <div className="page prose">
      <h1 className="page-title">Unlock on XO</h1>
      <p className="lead">
        Unlock&apos;s work for the BCH BLAZE 2026 <strong>Migrate to XO</strong> and <strong>Build with XO</strong> bounties,
        as two separate XO templates.
      </p>

      <h2>Migrate to XO: the purchase flow</h2>
      <p>
        Unlock&apos;s purchase transaction as a two-party <code>sell</code> action. The seller sets the item, price and receipt
        fee and gets an XO-generated payout key. The buyer adds their checkout nonce, funds and signs. The outputs match
        the original app: price to the seller, 3% fee to the receipt minter, <code>OP_RETURN &quot;UNLK&quot; &lt;item&gt; &lt;nonce&gt;</code>,
        and change. The XO-built transaction passes the original Unlock server&apos;s payment verifier, and is rejected with a wrong nonce.
      </p>
      <Links rows={MIGRATE} />

      <h2>Build with XO: split sales</h2>
      <p>
        A new feature Unlock never had: one purchase pays a seller <em>and</em> a collaborator directly, at shares agreed before
        the sale. Action <code>splitSale</code> has three roles (seller, collaborator, buyer), and the collaborator withdraws their
        share with <code>withdrawShare</code> without the seller.
      </p>
      <Links rows={BUILD} />

      <h2>Reproduce</h2>
      <p>
        Step-by-step instructions, scripts and versions:{" "}
        <a href={`${SITE.repoUrl}/tree/main/xo`} target="_blank" rel="noreferrer">xo/README.md</a>. Technical notes with bugs and
        repro steps: <a href={`${GH}/NOTES.md`} target="_blank" rel="noreferrer">xo/NOTES.md</a>.
      </p>

      <h2>Developing with XO: feedback</h2>
      <p>
        I was totally new to XO until I joined the hackathon and learnt more about it. When opening the template for the
        first time, the structure really amused me with the clearly laid out outputs.
      </p>
      <p>
        But this still didn&apos;t make me sure what the unlock script was for. Then I migrated the Unlock purchase to an XO
        template. The original app had a buyer make the payment that pays the seller with a 3% fee for the receipt minter
        and tags every transaction with a UNLK followed by item and nonce, but in the XO version, the seller creates the
        invitation with the item sets along with other variants and the buyer joins and adds their checkout code, and
        signs. Similarly the original Unlock server also accepted the XO-built transaction and rejected it when a wrong
        nonce was supplied as it was supposed to.
      </p>
      <p>
        I also liked the concept of seller/buyer split where nobody shares the keys, and the follow-up of withdraw action
        only took a few lines in the template. Also the silent wrong bytes issue was worrying. Writing the tag output as
        inline expression produced garbage with no error because XO read the result as a text instead of bytes, which is
        really dangerous for a payment system. Also the docs setup example crashes with SQLite Storage which I found while
        building so I had to switch to IndexedDB. Also there are no docs on how recovery works.
      </p>
      <p>
        I hope the silent bytes bug is solved and the docs are updated to a working storage config. As a beginner who has
        great capability to leverage the use of AI, I&apos;d want a concrete example of a two-role template where one output
        requires data from a specific role. The multi-party model fits sales and escrow well, I&apos;d use it for deals
        where two people need to build one transaction without trusting each other.
      </p>
      <p>
        — aquarush (<a href={`${GH}/FEEDBACK.md`} target="_blank" rel="noreferrer">also in the repo</a>)
      </p>
    </div>
  );
}
