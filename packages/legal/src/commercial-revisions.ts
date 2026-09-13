import type {
  LegalDocument,
  LegalDocumentKind,
  LegalLocale,
  LegalSection,
} from './types';

const content: Record<
  LegalLocale,
  Record<LegalDocumentKind, Array<[string, string]>>
> = {
  en: {
    terms: [
      [
        'Purchase terms and Polar',
        `The checkout or signed order form identifies the plan, currency, billing interval, full amount due, seat basis, included allowances and applicable taxes. A monthly equivalent for annual billing is an illustration; the annual total is charged for the annual period. A pitch, roadmap, beta label or proposed price is not an offer or a promise of availability.

Where checkout is provided by Polar, Polar acts as merchant of record and authorized reseller for that transaction. Tuturuuu supplies the product and service license. The [Polar Buyer Terms](https://polar.sh/legal/checkout-buyer-terms) govern Polar checkout and reseller services. Use the payment method, invoice, cancellation and refund channels identified on your receipt or billing portal. Do not send full payment-card details to Tuturuuu support.`,
      ],
      [
        'Seats, renewals, changes and refunds',
        `The purchased plan defines who is a billable member and whether guest access is included; an invitation alone does not authorize an undisclosed charge. Administrators are responsible for reviewing seat quantities, renewal dates and any displayed proration before confirming changes. Cancellation through the billing portal stops future renewal according to the displayed effective date; deleting an app or leaving a workspace is not a cancellation request.

A new list price does not itself change an existing subscription. Existing pricing, change notices and effective dates follow the applicable subscription, order form and mandatory law. Material adverse changes require the notice and consent applicable to the transaction. Refund requests may be made through the receipt or billing portal, or to legal@tuturuuu.com for routing. Polar processes refunds for Polar purchases; mandatory withdrawal, refund and other consumer rights remain available. No blanket no-refund rule overrides those rights or Polar's applicable buyer terms.`,
      ],
      [
        'Usage budgets, limits and data after downgrade',
        `Allowances belong to the account or workspace identified in the purchased plan; paid workspace capacity is not automatically shared across independent workspaces. Usage counters, reset periods, reservation rules, credit expiry and any billable failures must be disclosed for the relevant feature. AI credits are service usage units, not money, deposits or transferable financial assets. Included and purchased credits may have different expiry rules stated before purchase.

An upgrade does not bypass security, abuse, per-file or provider safety limits. Additional paid consumption requires the applicable purchase or enabled spending authorization. When a lower allowance applies, Tuturuuu may restrict new consumption while preserving existing data access and export where technically and legally available. A quota reduction alone is not permission to delete customer content. Security incidents, unlawful content and legal obligations may require separate restrictions.`,
      ],
    ],
    privacy: [
      [
        'Billing, metering and connected services',
        `Billing and entitlement operations use customer or workspace identifiers, member counts, plan and product references, invoice and payment status, usage totals, timestamps and support records. These records support access decisions, reconciliation, fraud prevention and billing disputes. Where Polar handles a transaction as merchant of record, it also processes transaction data for its own payment, tax and compliance responsibilities under its privacy notice.

Workspace administrators may see membership and usage information needed to administer their workspace. Connecting an app does not make all workspace content public. Shared links, recordings, AI context and integrations require appropriate permissions and user notices. Do not put secrets, full payment-card details or unrelated sensitive content into usage metadata.`,
      ],
      [
        'Current law and requests',
        `Applicable privacy rights depend on the individual, processing activity and governing law. Vietnam's Law on Personal Data Protection No. 91/2025/QH15 took effect on 1 January 2026; implementing rules and other applicable laws must also be considered. Where GDPR or UK GDPR applies, rights and transfer safeguards follow those laws. This policy does not claim universal applicability or certified compliance.

Contact privacy@tuturuuu.com for a rights request, processing question or applicable complaint route. We may verify identity proportionately. For customer-controlled workspace content, we coordinate with the relevant controller. Retention, deletion, provider configuration and training claims require verification for the specific service; a higher plan does not remove an individual's statutory rights.`,
      ],
    ],
    dpa: [
      [
        'Processing particulars and independent roles',
        `Processing may involve workspace members, guests, customers, contacts, learners and other people whose data the customer submits. It covers hosting, storage, retrieval, access control, transmission, support, deletion and configured AI or integration processing for the service term and applicable return/deletion period. Data categories are described in the Privacy Policy and customer instructions. The customer must not submit data prohibited by its agreement and must identify any special processing requirements before use.

A provider acting as an independent controller for its own billing, legal or payment obligations is not a subprocessor for those activities merely because it appears in the provider registry. Executed agreements must identify the applicable roles, locations, transfer mechanism and security annex. A registry entry alone is not an executed international-transfer agreement.`,
      ],
      [
        'Incident assistance and exit',
        `Where processor obligations apply, Tuturuuu notifies the customer without undue delay after becoming aware of a personal data breach affecting customer data; notification is not postponed solely to await a completed investigation. Available information may be provided in stages, with reasonable assistance for the customer's reporting and rights-response obligations.

On termination, the customer may request return or deletion of customer-controlled personal data under the agreement. Backup cycles and legally required retention must be explained, and retained data remains protected and limited to the permitted purpose. Account-level billing records retained under an independent legal obligation are handled under the Privacy Policy. Plan downgrade or credit exhaustion does not override these obligations.`,
      ],
    ],
    sla: [
      [
        'Coverage, dependencies and credits',
        `A plan name, pricing card or pitch does not activate an SLA. An executed order must name the covered production services, measurement window, availability target, support hours, severity definitions, exclusions and claim procedure. Preview products and unapproved roadmap capabilities are outside coverage unless explicitly included.

The order must explain treatment of dependencies and provider outages; the fact that infrastructure is supplied by a third party does not by itself decide whether an outage is excluded. Service credits are distinct from AI usage credits, refunds and mandatory legal remedies. Where a merchant of record issues invoices, any approved service credit must use a supported billing adjustment or another agreed method rather than promising an unsupported invoice operation.`,
      ],
    ],
    subprocessors: [
      [
        'Provider roles and feature-specific processing',
        `The registry identifies providers that may process data; it is not a statement that every customer uses every provider or that every provider acts as a processor for every activity. Polar may act independently for merchant-of-record transactions. AI, communications and integration providers depend on enabled functionality and routing.

Cloudflare services may support application execution, durable collaboration state, file storage and realtime/media delivery in addition to network security. Confirm the service-specific data flow, enabled region and contractual safeguards before making residency, retention or no-training commitments. Material changes follow applicable contractual notice and objection rights; requests can be sent to privacy@tuturuuu.com.`,
      ],
    ],
  },
  vi: {
    terms: [
      [
        'Điều kiện mua và Polar',
        `Trang thanh toán hoặc đơn đặt hàng đã ký xác định gói, tiền tệ, chu kỳ, tổng tiền phải trả, cách tính thành viên, hạn mức và thuế. Mức tương đương tháng của gói năm chỉ để minh họa; tổng năm được thu cho cả kỳ năm. Bản pitch, lộ trình, nhãn beta hoặc giá đề xuất không phải chào bán hay cam kết khả dụng.

Khi thanh toán qua Polar, Polar là bên bán lại được ủy quyền và merchant of record của giao dịch. Tuturuuu cung cấp sản phẩm và quyền sử dụng dịch vụ. [Điều khoản người mua Polar](https://polar.sh/legal/checkout-buyer-terms) điều chỉnh dịch vụ thanh toán và bán lại của Polar. Sử dụng kênh phương thức thanh toán, hóa đơn, hủy và hoàn tiền trên biên nhận hoặc cổng thanh toán. Không gửi thông tin thẻ đầy đủ cho hỗ trợ Tuturuuu.`,
      ],
      [
        'Thành viên, gia hạn, thay đổi và hoàn tiền',
        `Gói đã mua quy định thành viên tính phí và quyền khách; một lời mời không tự cho phép khoản phí chưa công bố. Quản trị viên cần xem số lượng thành viên, ngày gia hạn và khoản điều chỉnh theo thời gian được hiển thị trước khi xác nhận thay đổi. Hủy qua cổng thanh toán ngừng gia hạn theo ngày hiệu lực hiển thị; xóa ứng dụng hoặc rời không gian không phải yêu cầu hủy.

Giá niêm yết mới không tự thay đổi thuê bao hiện có. Giá, thông báo và ngày áp dụng theo thuê bao, đơn đặt hàng và pháp luật bắt buộc. Thay đổi bất lợi trọng yếu cần thông báo và sự đồng ý áp dụng. Yêu cầu hoàn tiền qua biên nhận, cổng thanh toán hoặc legal@tuturuuu.com để được chuyển đúng nơi. Polar xử lý hoàn tiền cho giao dịch Polar; quyền rút lại giao dịch, hoàn tiền và quyền người tiêu dùng bắt buộc vẫn được bảo đảm. Không quy tắc cấm hoàn tiền chung nào thay thế các quyền này hoặc điều khoản người mua Polar.`,
      ],
      [
        'Ngân sách sử dụng, giới hạn và dữ liệu khi hạ gói',
        `Hạn mức thuộc tài khoản hoặc không gian được xác định trong gói; dung lượng trả phí không tự chia sẻ giữa các không gian độc lập. Bộ đếm, kỳ đặt lại, quy tắc giữ chỗ, hạn tín dụng và lỗi tính phí phải được công bố cho tính năng liên quan. Tín dụng AI là đơn vị sử dụng dịch vụ, không phải tiền, tiền gửi hay tài sản tài chính chuyển nhượng. Tín dụng kèm gói và tín dụng mua thêm có thể có hạn dùng khác nhau được nêu trước khi mua.

Nâng gói không bỏ qua giới hạn bảo mật, chống lạm dụng, từng tệp hoặc an toàn nhà cung cấp. Mức dùng trả phí bổ sung cần giao dịch hoặc ủy quyền chi tiêu phù hợp. Khi hạn mức giảm, Tuturuuu có thể hạn chế mức dùng mới và giữ truy cập, xuất dữ liệu hiện có trong phạm vi kỹ thuật và pháp luật cho phép. Giảm hạn mức tự nó không cho phép xóa nội dung. Sự cố bảo mật, nội dung trái luật và nghĩa vụ pháp lý có thể cần hạn chế riêng.`,
      ],
    ],
    privacy: [
      [
        'Thanh toán, đo mức dùng và dịch vụ kết nối',
        `Thanh toán và quyền gói sử dụng mã khách hàng hoặc không gian, số thành viên, mã gói và sản phẩm, trạng thái hóa đơn và thanh toán, tổng mức dùng, thời điểm và hồ sơ hỗ trợ. Dữ liệu này phục vụ cấp quyền, đối soát, chống gian lận và giải quyết tranh chấp. Khi Polar là merchant of record, Polar cũng xử lý dữ liệu giao dịch cho trách nhiệm thanh toán, thuế và tuân thủ riêng theo thông báo quyền riêng tư của họ.

Quản trị viên có thể xem thông tin thành viên và mức dùng cần thiết để quản lý không gian. Kết nối ứng dụng không làm toàn bộ nội dung công khai. Liên kết chia sẻ, bản ghi, ngữ cảnh AI và tích hợp cần quyền và thông báo phù hợp. Không đưa bí mật, thông tin thẻ đầy đủ hoặc nội dung nhạy cảm không liên quan vào siêu dữ liệu sử dụng.`,
      ],
      [
        'Pháp luật hiện hành và yêu cầu',
        `Quyền riêng tư áp dụng tùy chủ thể, hoạt động xử lý và luật điều chỉnh. Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 có hiệu lực từ 01/01/2026; cần xét văn bản hướng dẫn và luật liên quan. Khi GDPR hoặc UK GDPR áp dụng, quyền và biện pháp chuyển dữ liệu theo các luật đó. Chính sách không khẳng định áp dụng toàn cầu hay chứng nhận tuân thủ.

Liên hệ privacy@tuturuuu.com để yêu cầu quyền dữ liệu, hỏi về xử lý hoặc kênh khiếu nại áp dụng. Chúng tôi có thể xác minh danh tính tương xứng. Với nội dung do khách hàng kiểm soát, chúng tôi phối hợp bên kiểm soát liên quan. Tuyên bố lưu giữ, xóa, cấu hình nhà cung cấp và huấn luyện cần kiểm chứng cho từng dịch vụ; gói cao hơn không làm mất quyền theo luật.`,
      ],
    ],
    dpa: [
      [
        'Chi tiết xử lý và vai trò độc lập',
        `Việc xử lý có thể liên quan thành viên, khách, khách hàng, liên hệ, người học và người khác có dữ liệu được khách hàng cung cấp. Hoạt động gồm lưu trữ, truy xuất, kiểm soát truy cập, truyền, hỗ trợ, xóa và AI hoặc tích hợp được cấu hình trong thời hạn dịch vụ và thời kỳ hoàn trả/xóa. Loại dữ liệu được nêu trong Chính sách quyền riêng tư và chỉ dẫn khách hàng. Không được gửi dữ liệu bị thỏa thuận cấm; cần xác định yêu cầu xử lý đặc biệt trước khi dùng.

Nhà cung cấp là bên kiểm soát độc lập cho nghĩa vụ thanh toán, pháp lý hoặc thuế riêng không trở thành bên xử lý phụ của hoạt động đó chỉ vì được liệt kê. Thỏa thuận đã ký cần xác định vai trò, địa điểm, cơ chế chuyển dữ liệu và phụ lục bảo mật. Mục trong danh mục không thay thế thỏa thuận chuyển dữ liệu quốc tế đã ký.`,
      ],
      [
        'Hỗ trợ sự cố và kết thúc dịch vụ',
        `Khi nghĩa vụ bên xử lý áp dụng, Tuturuuu thông báo không chậm trễ bất hợp lý sau khi biết vi phạm dữ liệu cá nhân ảnh hưởng dữ liệu khách hàng; không trì hoãn chỉ để chờ điều tra hoàn tất. Thông tin có thể được cung cấp từng giai đoạn, cùng hỗ trợ hợp lý cho nghĩa vụ báo cáo và yêu cầu quyền dữ liệu của khách hàng.

Khi chấm dứt, khách hàng có thể yêu cầu hoàn trả hoặc xóa dữ liệu do mình kiểm soát theo thỏa thuận. Chu kỳ sao lưu và lưu giữ bắt buộc cần được giải thích; dữ liệu giữ lại vẫn được bảo vệ và giới hạn mục đích. Hồ sơ thanh toán lưu theo nghĩa vụ độc lập tuân theo Chính sách quyền riêng tư. Hạ gói hoặc hết tín dụng không thay thế các nghĩa vụ này.`,
      ],
    ],
    sla: [
      [
        'Phạm vi, phụ thuộc và tín dụng dịch vụ',
        `Tên gói, thẻ giá hoặc pitch không kích hoạt SLA. Đơn đặt hàng đã ký phải nêu dịch vụ sản xuất, khoảng đo, mục tiêu khả dụng, giờ hỗ trợ, mức độ sự cố, ngoại lệ và thủ tục yêu cầu. Bản xem trước và tính năng lộ trình chưa duyệt không thuộc phạm vi trừ khi được nêu rõ.

Đơn đặt hàng phải giải thích phụ thuộc và sự cố nhà cung cấp; việc hạ tầng do bên thứ ba cung cấp không tự quyết định ngoại lệ. Tín dụng dịch vụ khác tín dụng AI, hoàn tiền và biện pháp pháp lý bắt buộc. Khi merchant of record phát hành hóa đơn, tín dụng đã duyệt cần dùng điều chỉnh được hệ thống hỗ trợ hoặc phương thức thỏa thuận, không hứa thao tác hóa đơn chưa được hỗ trợ.`,
      ],
    ],
    subprocessors: [
      [
        'Vai trò nhà cung cấp và xử lý theo tính năng',
        `Danh mục nêu nhà cung cấp có thể xử lý dữ liệu; không khẳng định mọi khách hàng dùng mọi nhà cung cấp hoặc mọi hoạt động đều là xử lý phụ. Polar có thể hoạt động độc lập cho giao dịch merchant of record. AI, liên lạc và tích hợp phụ thuộc tính năng và tuyến xử lý được bật.

Cloudflare có thể hỗ trợ chạy ứng dụng, trạng thái cộng tác bền vững, lưu trữ tệp và truyền thời gian thực/phương tiện ngoài bảo mật mạng. Cần xác nhận luồng dữ liệu, khu vực bật và biện pháp hợp đồng trước khi cam kết nơi lưu trữ, thời hạn hoặc không huấn luyện. Thay đổi trọng yếu theo quyền thông báo và phản đối trong hợp đồng; gửi yêu cầu đến privacy@tuturuuu.com.`,
      ],
    ],
  },
};

export function reviseLegalDocument(document: LegalDocument): LegalDocument {
  const kind = document.kind;
  if (kind === 'acceptable-use' || kind === 'community-guidelines')
    return document;
  const additions = content[document.locale][kind];
  const sections = document.sections
    .filter(
      (section) =>
        !(kind === 'terms' && section.id === 'purchase-terms') &&
        !(kind === 'dpa' && section.id === 'incident-assistance')
    )
    .map((section) => ({ ...section }));
  const summaryRows = document.summaryRows.map((row) => ({ ...row }));
  // Replace conflicting older clauses instead of appending contradictory policy.
  if (document.kind === 'privacy') {
    const rights = sections.find((section) => section.id === 'privacy-rights');
    if (rights)
      rights.content =
        document.locale === 'en'
          ? 'Individuals retain applicable privacy rights. Workspace administrators and educational institutions must provide appropriate notices and obtain any required guardian consent before using the Services with children. AI and third-party integrations may impose additional age restrictions. Contact privacy@tuturuuu.com for assistance.'
          : 'Cá nhân giữ quyền riêng tư áp dụng. Quản trị viên và cơ sở giáo dục phải thông báo phù hợp và có sự đồng ý của người giám hộ khi cần trước khi dùng Dịch vụ với trẻ em. AI và tích hợp có thể có giới hạn tuổi bổ sung. Liên hệ privacy@tuturuuu.com để được hỗ trợ.';
  }
  if (document.kind === 'sla') {
    const claims = sections.find((section) => section.id === 'sla-claims');
    if (claims)
      claims.content =
        document.locale === 'en'
          ? 'The executed order specifies eligibility, credit limits, claim deadlines and the supported remedy. Submit claims through the designated support channel with incident dates, impact and request identifiers. Tuturuuu assesses claims in good faith. Billing adjustments must be supported by the merchant of record; mandatory legal remedies remain available.'
          : 'Đơn đặt hàng đã ký quy định điều kiện, giới hạn tín dụng, thời hạn khiếu nại và biện pháp hỗ trợ. Gửi yêu cầu qua kênh hỗ trợ được chỉ định kèm thời gian, tác động và mã yêu cầu. Tuturuuu đánh giá thiện chí; điều chỉnh thanh toán phải được bên bán hỗ trợ và không loại bỏ quyền bắt buộc theo luật.';
    const creditsSummary = summaryRows.find(
      (row) => row.topic === (document.locale === 'en' ? 'Credits' : 'Tín dụng')
    );
    if (creditsSummary)
      creditsSummary.summary =
        document.locale === 'en'
          ? 'Remedies follow the signed order and supported billing process.'
          : 'Biện pháp theo đơn đã ký và quy trình thanh toán được hỗ trợ.';
    const claimsSummary = summaryRows.find(
      (row) => row.topic === (document.locale === 'en' ? 'Claims' : 'Yêu cầu')
    );
    if (claimsSummary)
      claimsSummary.summary =
        document.locale === 'en'
          ? 'Claim deadlines and eligibility follow the signed order.'
          : 'Thời hạn và điều kiện theo đơn đặt hàng đã ký.';
    const exclusions = sections.find(
      (section) => section.id === 'sla-exclusions'
    );
    if (exclusions)
      exclusions.content =
        document.locale === 'en'
          ? 'The executed order defines maintenance windows, exclusions, incident communications and dependency treatment. Exclusions must be applied consistently with that order and mandatory law. Tuturuuu prioritizes restoration and accurate incident assessment.'
          : 'Đơn đặt hàng đã ký quy định bảo trì, ngoại lệ, thông báo sự cố và cách xử lý phụ thuộc. Ngoại lệ phải phù hợp đơn đặt hàng và pháp luật bắt buộc. Tuturuuu ưu tiên khôi phục và đánh giá sự cố chính xác.';
  }
  return {
    ...document,
    summaryRows,
    badge:
      document.locale === 'en' ? 'Draft for review' : 'Bản dự thảo cần rà soát',
    version: '2026-09-13-draft',
    // This is a revision date, not a newly activated contract date.
    publishedDate: '2026-09-13',
    reviewRequired: true,
    footer: `${document.locale === 'en' ? 'Draft revision for review; not a newly effective agreement.' : 'Bản sửa đổi để rà soát; chưa phải thỏa thuận mới có hiệu lực.'} ${document.footer}`,
    sections: [
      ...sections,
      ...additions.map(
        ([title, text]): LegalSection => ({
          title,
          content: text,
          icon: 'scale',
          tone: 'blue',
        })
      ),
    ],
  };
}
