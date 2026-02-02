//* EXTERNAL MAPPING

// STATUS: ✅
export const billCouponsMapping = (_: string, data: any[]) =>
  data.map((i) => ({
    _id: i?.id,
    invoice_id: i?.bill_id,
    promo_id: i?.coupon_id,
    code: i?.code,
    name: i?.name,
    value: i?.value,
    use_ratio: i?.ratio,
    created_at: i?.created_at,
  }));

// STATUS: ✅
export const billPackagesMapping = (_: string, data: any[]) =>
  data.map((i) => ({
    _id: i?.id,
    invoice_id: i?.bill_id,
    product_id: i?.pkg_id,
    product_name: i?.name,
    product_unit: 'Cái',
    unit_id: 'dbd4d6a0-6c59-4383-8512-8e649413f4ff',
    warehouse_id: '9ed8a0ed-a192-456d-9382-88258300fb27',
    amount: i?.amount,
    price: i?.price,
    created_at: i?.created_at,
  }));

// STATUS: ✅
export const billsMapping = (wsId: string, data: any[]) =>
  data.map((i) => {
    const walletId =
      i?.method === 'CASH'
        ? '354f92e4-8e7c-404a-b461-cfe6a8b67ba8'
        : i?.method === 'BANKING'
          ? '8ca90c9e-de28-4284-b388-294b704d78bc'
          : '';

    const categoryId =
      i?.type === 'TUITION'
        ? '54f92acb-83c1-4755-a3d8-6a918f91880c'
        : i?.type === 'COURSE'
          ? '8f4136cf-08d4-4fb5-b075-377e3f664021'
          : i?.type === 'LESSON'
            ? '93a2a5c4-d518-4ef1-9a3d-3722a794070a'
            : i?.type === 'ACCESSORY'
              ? 'b4662d35-603a-4fd3-8193-ba88d80ff2ef'
              : i?.type === 'BOOK'
                ? 'a1377214-23a3-4fb4-83ed-379c7330f045'
                : i?.type === 'EVENT'
                  ? '0fe626f5-2ce7-405c-a545-4b90649d9aa1'
                  : null;

    return {
      id: i?.id,
      wallet_id: walletId,
      price: i?.total,
      paid_amount: i?.paid_amount,
      total_diff: i?.price_diff,
      notice: i?.content,
      note: i?.note,
      customer_id: i?.customer_id,
      category_id: categoryId,
      completed_at: i?.created_at,
      creator_id: i?.creator_id,
      ws_id: wsId,
      valid_until: i?.valid_until,
      created_at: i?.created_at,
    };
  });

// STATUS: ✅
export const classAttendanceMapping = (_: string, data: any[]) =>
  data.map((i) => ({
    group_id: i?.class_id,
    user_id: i?.user_id,
    date: i?.date,
    status: i?.status,
    notes: i?.notes || '',
    created_at: i?.created_at,
  }));

// STATUS: ✅
export const classMembersMapping = (_: string, data: any[]) =>
  data.map((i) => ({
    user_id: i?.user_id,
    group_id: i?.class_id,
    role: i?.role,
    created_at: i?.created_at,
  }));

// STATUS: ✅
export const classPackagesMapping = (_: string, data: any[]) =>
  data.map((i) => ({
    group_id: i?.class_id,
    product_id: i?.package_id,
    unit_id: 'dbd4d6a0-6c59-4383-8512-8e649413f4ff',
    created_at: i?.created_at,
  }));

// STATUS: ✅
export const classScoresMapping = (_: string, data: any[]) =>
  data.map((i) => ({
    user_id: i?.user_id,
    indicator_id: i?.score_id,
    value: i?.value,
    creator_id: i?.creator_id,
    created_at: i?.created_at,
  }));

// STATUS: ✅
export const classesMapping = (wsId: string, data: any[]) =>
  data.map((i) => ({
    id: i?.id,
    name: i?.code,
    ws_id: wsId,
    notes: `${i?.mode ? `Mode: ${i.mode}\n` : ''}${i?.location ? `Location: ${i.location}\n` : ''}${i?.syllabus ? `Syllabus: ${i.syllabus}\n` : ''}${i?.notes ? `Notes: ${i.notes}\n` : ''}`,
    starting_date: i?.starting_date,
    ending_date: i?.ending_date,
    sessions: i?.sessions,
    archived: i?.status === 'COMPLETED',
    created_at: i?.created_at,
  }));

// STATUS: ✅
export const couponsMapping = (wsId: string, data: any[]) =>
  data.map((i) => ({
    id: i?.id,
    name: i?.name,
    description: i?.content,
    code: i?.code,
    value: i?.value,
    use_ratio: i?.use_ratio,
    ws_id: wsId,
    creator_id: i?.creator_id,
    created_at: i?.created_at,
  }));

// STATUS: ✅
export const lessonsMapping = (_: string, data: any[]) =>
  data.map((i) => ({
    id: i?.id,
    group_id: i?.class_id,
    title: i?.title || '',
    content: i?.content || '',
    notes: i?.notes || '',
    created_at: i?.created_at,
  }));

// STATUS: ✅
export const packageStockChangesMapping = (_: string, data: any[]) => {
  console.log('packageStockChangesMapping', data);
  return data.map((i) => ({
    id: i?.id,
    product_id: i?.pkg_id,
    unit_id: 'dbd4d6a0-6c59-4383-8512-8e649413f4ff',
    warehouse_id: '9ed8a0ed-a192-456d-9382-88258300fb27',
    amount: i?.amount,
    beneficiary_id: i?.beneficiary_id,
    creator_id: i?.creator_id,
    created_at: i?.created_at,
  }));
};

// STATUS: ✅
export const packagesMapping = (wsId: string, data: any[]) =>
  data.map((i) => ({
    id: i?.id,
    name: i?.name,
    description: i?.content,
    avatar_url: i?.avatar_url,
    category_id:
      i?.type === 'COURSE'
        ? 'b58cdb48-67fb-49ef-86c6-1ba84c4728d6'
        : i?.type === 'LESSON'
          ? '6a5b39e6-c3ac-4f21-ac44-faaacf02bbde'
          : i?.type === 'ACCESSORY'
            ? '4b1733db-38b7-4603-bf66-6f4e6b582b5b'
            : i?.type === 'BOOK'
              ? '3cb87605-c01a-441e-a98a-9324cf48657a'
              : i?.type === 'EVENT'
                ? '9bc7ee58-537a-4ff4-9a8f-ee10a875568c'
                : undefined,
    manufacturer: i?.manufacturer,
    ws_id: wsId,
    creator_id: i?.creator_id,
    created_at: i?.created_at,
  }));

// STATUS: ✅
export const paymentMethodsMapping = (wsId: string, data: any[]) =>
  data.map((i) => ({
    id: i?.id,
    name: i?.name,
    ws_id: wsId,
  }));

// STATUS: ✅
export const rolesMapping = (wsId: string, data: any[]) =>
  data.map((i) => ({
    id: i?.id,
    name: i?.name,
    ws_id: wsId,
    created_at: i?.created_at,
  }));

// STATUS: ✅
export const scoreNamesMapping = (wsId: string, data: any[]) =>
  data.map((i) => ({
    id: i?.id,
    name: i?.name,
    group_id: i?.class_id,
    unit: 'Điểm',
    factor: i?.factor,
    ws_id: wsId,
    created_at: i?.created_at,
  }));

// STATUS: ✅
export const groupedScoreNamesMapping = (_: string, data: any[]) =>
  data.map((i) => ({
    indicator_id: i?.id,
    group_id: i?.class_id,
    created_at: i?.created_at,
  }));

// STATUS: ✅
export const studentFeedbacksMapping = (_: string, data: any[]) =>
  data.map((i) => ({
    id: i?.id,
    user_id: i?.user_id,
    group_id: i?.class_id,
    content: i?.content,
    require_attention: i?.performance === 'NEED_HELP',
    creator_id: i?.creator_id,
    created_at: i?.created_at,
  }));

// STATUS: ✅
export const transactionCategoriesMapping = (wsId: string, data: any[]) =>
  data.map((i) => ({
    id: i?.id,
    name: i?.name,
    is_expense: i?.is_expense,
    ws_id: wsId,
  }));

// STATUS: ✅
export const userCouponsMapping = (_: string, data: any[]) =>
  data.map((i) => ({
    user_id: i?.user_id,
    promo_id: i?.coupon_id,
    created_at: i?.created_at,
  }));

// STATUS: ✅
export const userMonthlyReportLogsMapping = (_: string, data: any[]) =>
  data.map((i) => ({
    id: i?.id,
    report_id: i?.report_id,
    user_id: i?.user_id,
    group_id: i?.class_id,
    title: i?.title,
    content: i?.learned_lessons,
    feedback: i?.feedback,
    score: i?.score,
    scores: i?.scores,
    creator_id: i?.creator_id,
    created_at: i?.created_at,
  }));

// STATUS: ✅
export const userMonthlyReportsMapping = (_: string, data: any[]) =>
  data.map((i) => ({
    id: i?.id,
    user_id: i?.user_id,
    group_id: i?.class_id,
    title: i?.title,
    content: i?.learned_lessons,
    feedback: i?.feedback,
    score: i?.score,
    scores: i?.scores,
    creator_id: i?.creator_id,
    created_at: i?.created_at,
    updated_at: i?.updated_at,
  }));

// STATUS: ✅
export const userStatusChangesMapping = (wsId: string, data: any[]) =>
  data.map((i) => ({
    id: i?.id,
    user_id: i?.user_id,
    ws_id: wsId,
    archived: i?.status === 'PERM_OFF' || i?.status === 'TEMP_OFF',
    archived_until: i?.off_until,
    creator_id: i?.creator_id,
    created_at: i?.created_at,
  }));

// STATUS: ✅
export const usersMapping = (wsId: string, data: any[]) =>
  data.map((i) => ({
    id: i?.id,
    email: i?.email || null,
    display_name: i?.nickname,
    full_name: i?.display_name,
    phone: i?.phone_number,
    avatar_url: i?.avatar_url,
    gender: i?.gender,
    birthday: i?.birthday,
    note: `${
      i?.alt_phone_number ? `Alt Phone: ${i.alt_phone_number}\n` : ''
    }${i?.relationship ? `Relationship: ${i.relationship}\n` : ''}${
      i?.notes ? `Notes: ${i.notes}\n` : ''
    }`,
    archived: !!(
      i?.status === 'PERM_OFF' ||
      i?.status === 'TEMP_OFF' ||
      i?.off_until
    ),
    archived_until: i?.off_until,
    ws_id: wsId,
    created_by: i?.creator_id,
    updated_by: i?.updater_id,
    created_at: i?.created_at,
    updated_at: i?.updated_at,
  }));

//! IGNORED, since it's handled by bills
export const walletTransactionsMapping = (__: string, _: any[]) => [] as any[];
// data.map((i) => {
//   // There is a "valid_until" field on item, which is type of date
//   // convert it to timestamptz (+7) and use it as "taken_at" field
//   const takenAt = i?.valid_until ? new Date(i?.valid_until) : null;

//   return {
//     id: generateUUID(i?.id, i?.wallet_id),
//     wallet_id: i?.wallet_id,
//     amount: i?.total + i?.price_diff,
//     description: i?.content,
//     category_id: i?.category_id,
//     taken_at: takenAt ? takenAt.toISOString() : i?.created_at,
//     created_at: i?.created_at,
//     _id: i?.id,
//   };
// });

//! IGNORED, since it's handled by payment methods
export const walletsMapping = (_: string, __: any[]) => [];

//* TUTURUUU INFRASTRUCTURE MAPPING

// STATUS: ✅
export const warehousesMapping = (wsId: string, data: any[]) =>
  data.map((i) => ({
    id: i?.id,
    name: i?.name,
    ws_id: wsId,
  }));

// STATUS: ✅
export const productCategoriesMapping = (wsId: string, data: any[]) =>
  data.map((i) => ({
    id: i?.id,
    name: i?.name,
    ws_id: wsId,
  }));

// STATUS: ✅
export const productUnitsMapping = (wsId: string, data: any[]) =>
  data.map((i) => ({
    id: i?.id,
    name: i?.name,
    ws_id: wsId,
  }));

// STATUS: ✅
export const productPricesMapping = (_: string, data: any[]) =>
  data.map((i) => ({
    product_id: i?.id,
    unit_id: 'dbd4d6a0-6c59-4383-8512-8e649413f4ff',
    warehouse_id: '9ed8a0ed-a192-456d-9382-88258300fb27',
    amount: i?.stock,
    price: i?.price,
    created_at: i?.created_at,
  }));
