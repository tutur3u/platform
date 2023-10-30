import { useCallback, useEffect, useState } from 'react';
import { Checkbox, Divider, Textarea } from '@mantine/core';
import { Vital } from '../../../../../../types/primitives/Vital';
import 'dayjs/locale/vi';
import { VitalGroup } from '../../../../../../types/primitives/VitalGroup';
import { DateTimePicker } from '@mantine/dates';
import WorkspaceUserSelector from '../../../../../../components/selectors/WorkspaceUserSelector';
import DiagnosisSelector from '../../../../../../components/selectors/DiagnosisSelector';
import CheckupVitalGroupInput from '../../../../../../components/inputs/CheckupVitalGroupInput';
import { useRouter } from 'next/router';
import { Checkup } from '../../../../../../types/primitives/checkup';
import useSWR from 'swr';
import CheckupVitalInput from '../../../../../../components/inputs/CheckupVitalInput';
import { Diagnosis } from '../../../../../../types/primitives/Diagnosis';
import { useSegments } from '../../../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../../../hooks/useWorkspaces';
import moment from 'moment';

export default function CheckupDetailsPage() {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  const router = useRouter();
  const { checkupId } = router.query;

  const checkupApiPath =
    ws && checkupId
      ? `/api/workspaces/${ws?.id}/healthcare/checkups/${checkupId}`
      : null;

  const vitalsApiPath =
    ws && checkupId
      ? `/api/workspaces/${ws?.id}/healthcare/checkups/${checkupId}/vitals`
      : null;

  const groupsApiPath =
    ws && checkupId
      ? `/api/workspaces/${ws?.id}/healthcare/checkups/${checkupId}/vital-groups`
      : null;

  const { data: checkup } = useSWR<Checkup>(checkupApiPath);
  const { data: checkupVitals } = useSWR<Vital[]>(vitalsApiPath);
  const { data: checkupGroups } = useSWR<VitalGroup[]>(groupsApiPath);

  const diagnosisApiPath =
    ws && checkup?.diagnosis_id
      ? `/api/workspaces/${ws?.id}/healthcare/diagnoses/${checkup.diagnosis_id}`
      : null;

  const { data: checkupDiagnosis } = useSWR<Diagnosis>(diagnosisApiPath);

  useEffect(() => {
    setRootSegment(
      ws
        ? [
            {
              content: ws?.name || 'Tổ chức không tên',
              href: `/${ws.id}`,
            },
            { content: 'Khám bệnh', href: `/${ws.id}/healthcare` },
            {
              content: 'Kiểm tra sức khoẻ',
              href: `/${ws.id}/healthcare/checkups`,
            },
            checkup?.id
              ? {
                  content: checkup.id,
                  href: `/${ws.id}/healthcare/checkups/${checkup.id}`,
                }
              : {
                  content: 'Đang tải...',
                  href: '#',
                },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, checkup?.id, setRootSegment]);

  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);

  useEffect(() => {
    if (checkupDiagnosis) setDiagnosis(checkupDiagnosis);
  }, [checkupDiagnosis]);

  const [userId, setUserId] = useState<string>('');

  const [checkupAt, setCheckupAt] = useState<Date | null>(new Date());
  const [nextCheckupAt, setNextCheckupAt] = useState<Date | null>(null);

  const [checked, setChecked] = useState<boolean>(false);
  const [nextChecked, setNextChecked] = useState<boolean>(false);

  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (checkup) {
      setUserId(checkup?.patient_id || '');

      setCheckupAt(
        checkup?.checkup_at ? moment(checkup.checkup_at).toDate() : null
      );

      setNextCheckupAt(
        checkup?.next_checkup_at
          ? moment(checkup.next_checkup_at).toDate()
          : null
      );

      setChecked(checkup?.checked || false);
      setNextChecked(checkup?.next_checked || false);

      setNote(checkup?.note || null);
    }
  }, [checkup]);

  const [vitals, setVitals] = useState<Vital[]>([]);
  const [groups, setGroups] = useState<VitalGroup[]>([]);

  useEffect(() => {
    if (checkupVitals) setVitals(checkupVitals);
  }, [checkupVitals]);

  useEffect(() => {
    if (checkupGroups) setGroups(checkupGroups);
  }, [checkupGroups]);

  const allVitalsValid = () => vitals.every((vital) => vital.id.length > 0);
  const allGroupsValid = () => groups.every((group) => group.id.length > 0);

  const hasRequiredFields = () =>
    userId && userId?.length > 0 && allVitalsValid() && allGroupsValid();

  const addEmptyVital = () => {
    setVitals((vitals) => [
      ...vitals,
      {
        id: '',
      },
    ]);
  };

  const [, setGroupVitals] = useState<
    {
      group_id: string;
      vitals: Vital[];
    }[]
  >([]);

  const addVitals = useCallback((groupId: string, vitals: Vital[]) => {
    setGroupVitals((groupVitals) => {
      const newGroupVitals = [...groupVitals];
      const index = newGroupVitals.findIndex(
        (groupVital) => groupVital.group_id === groupId
      );
      if (index === -1) {
        newGroupVitals.push({
          group_id: groupId,
          vitals: vitals,
        });
      } else newGroupVitals[index].vitals = vitals;

      return newGroupVitals;
    });

    setVitals((oldVitals) =>
      [...oldVitals, ...vitals]
        .filter((vital) => vital.id.length > 0)
        .filter(
          (vital, index, self) =>
            self.findIndex((v) => v.id === vital.id) === index
        )
    );
  }, []);

  const updateVital = (index: number, vital: Vital | null) => {
    setVitals((vitals) => {
      const newVitals = [...vitals];
      if (newVitals[index]) newVitals[index] = vital || { id: '' };
      return newVitals;
    });
  };

  const removeVital = (index: number) => {
    setVitals((vitals) => {
      const newVitals = [...vitals];
      newVitals.splice(index, 1);
      return newVitals;
    });

    setGroupVitals((groupVitals) => {
      const newGroupVitals = [...groupVitals];

      newGroupVitals.forEach((groupVital) => {
        groupVital.vitals = groupVital.vitals.filter(
          (vital) => vitals[index].id !== vital.id
        );
      });

      const newGroups = newGroupVitals.filter(
        (groupVital) => groupVital.vitals.length > 0
      );

      setGroups((groups) =>
        groups.filter((group) => newGroups.some((g) => g.group_id === group.id))
      );

      return newGroups;
    });
  };

  const addEmptyGroup = () => {
    setGroups((groups) => [
      ...groups,
      {
        id: '',
      },
    ]);
  };

  const updateGroupId = (index: number, groupId: string) => {
    setGroups((groups) => {
      const newGroups = [...groups];
      newGroups[index].id = groupId;
      return newGroups;
    });
  };

  const removeGroup = (index: number) => {
    setGroups((groups) => {
      const newGroups = [...groups];
      newGroups.splice(index, 1);
      return newGroups;
    });
  };

  if (!ws) return null;

  return (
    <div className="mt-2 flex min-h-full w-full flex-col ">
      <div className="grid gap-x-8 gap-y-4 xl:gap-x-16">
        <div className="flex items-end justify-end gap-2">
          <button
            className={`rounded border border-red-300/10 bg-red-300/10 px-4 py-1 font-semibold text-red-300 transition ${
              checkup ? 'hover:bg-red-300/20' : 'cursor-not-allowed opacity-50'
            }`}
          >
            Xoá
          </button>

          <button
            className={`rounded border border-blue-300/10 bg-blue-300/10 px-4 py-1 font-semibold text-blue-300 transition ${
              hasRequiredFields()
                ? 'hover:bg-blue-300/20'
                : 'cursor-not-allowed opacity-50'
            }`}
          >
            Lưu thay đổi
          </button>
        </div>
      </div>

      <Divider className="my-4" />
      <div className="grid gap-x-8 gap-y-4 xl:grid-cols-4 xl:gap-x-16">
        <div className="grid h-fit gap-x-4 gap-y-2 md:grid-cols-2">
          <div className="col-span-full">
            <div className="text-2xl font-semibold">Thông tin cơ bản</div>
            <Divider className="my-2" variant="dashed" />
          </div>

          <WorkspaceUserSelector
            userId={userId}
            setUserId={setUserId}
            className="col-span-full"
            notEmpty
            required
          />

          <Divider className="col-span-full mt-2" />

          <DateTimePicker
            label="Khám vào lúc"
            placeholder="Chọn thời gian khám"
            value={checkupAt}
            onChange={setCheckupAt}
            className="md:col-span-2"
            valueFormat="HH:mm - dddd, DD/MM/YYYY"
            locale="vi"
          />

          {nextCheckupAt != null ? (
            <DateTimePicker
              label="Tái khám vào lúc"
              placeholder="Chọn thời gian tái khám"
              value={nextCheckupAt}
              onChange={setNextCheckupAt}
              className="md:col-span-2"
              valueFormat="HH:mm - dddd, DD/MM/YYYY"
              classNames={{
                input: 'bg-white/5 border-zinc-300/20 font-semibold',
              }}
              clearable
              locale="vi"
            />
          ) : (
            <button
              className="rounded border border-blue-500/10 bg-blue-500/10 px-4 py-2 font-semibold text-blue-600 transition hover:bg-blue-500/20 dark:border-blue-300/10 dark:bg-blue-300/10 dark:text-blue-300 dark:hover:bg-blue-300/20 md:col-span-2"
              onClick={() => setNextCheckupAt(checkupAt || new Date())}
            >
              + Thêm lịch tái khám
            </button>
          )}

          <Divider className="col-span-full my-2" />

          <Checkbox
            label="Đã khám"
            checked={checked}
            onChange={(event) => setChecked(event.currentTarget.checked)}
          />

          {nextCheckupAt && (
            <Checkbox
              label="Đã tái khám"
              checked={nextChecked}
              onChange={(event) => setNextChecked(event.currentTarget.checked)}
            />
          )}

          <Divider className="col-span-full my-2" />

          <DiagnosisSelector
            diagnosis={diagnosis}
            setDiagnosis={setDiagnosis}
            className="md:col-span-2"
          />

          {diagnosis?.description && (
            <div className="col-span-full w-full rounded border border-zinc-700 bg-zinc-800/70 p-2 text-center">
              <div className="mb-2 rounded border border-purple-300/20 bg-purple-300/10 px-4 py-1 text-center text-lg font-semibold text-purple-300">
                Mô tả
              </div>
              <div className="text-zinc-300">
                {diagnosis.description || 'Không có'}
              </div>
            </div>
          )}

          {diagnosis?.note && (
            <div className="col-span-full w-full rounded border border-zinc-700 bg-zinc-800/70 p-2 text-center">
              <div className="mb-2 rounded border border-orange-300/20 bg-orange-300/10 px-4 py-1 text-center text-lg font-semibold text-orange-300">
                Ghi chú
              </div>
              <div className="text-zinc-300">{diagnosis.note}</div>
            </div>
          )}

          <Divider className="col-span-full my-2" />

          {note != null ? (
            <Textarea
              label="Ghi chú"
              placeholder="Nhập ghi chú cho nhóm chỉ số này"
              value={note}
              onChange={(e) => setNote(e.currentTarget.value)}
              className="md:col-span-2"
              minRows={5}
              classNames={{
                input: 'bg-white/5 border-zinc-300/20 font-semibold',
              }}
            />
          ) : (
            <button
              className="rounded border border-blue-500/10 bg-blue-500/10 px-4 py-2 font-semibold text-blue-600 transition hover:bg-blue-500/20 dark:border-blue-300/10 dark:bg-blue-300/10 dark:text-blue-300 dark:hover:bg-blue-300/20 md:col-span-2"
              onClick={() => setNote('')}
            >
              + Thêm ghi chú
            </button>
          )}
        </div>

        <div className="grid h-fit gap-x-4 gap-y-2 xl:col-span-3">
          <div className="col-span-full">
            <div className="text-2xl font-semibold">
              Chỉ số ({vitals?.length || 0})
            </div>
            <Divider className="mb-4 mt-2" variant="dashed" />

            <div className="flex gap-2">
              <button
                className="rounded border border-blue-500/10 bg-blue-500/10 px-4 py-1 font-semibold text-blue-600 transition hover:bg-blue-500/20 dark:border-blue-300/10 dark:bg-blue-300/10 dark:text-blue-300 dark:hover:bg-blue-300/20"
                onClick={addEmptyGroup}
              >
                + Thêm nhóm chỉ số
              </button>
              <button
                className="rounded border border-blue-500/10 bg-blue-500/10 px-4 py-1 font-semibold text-blue-600 transition hover:bg-blue-500/20 dark:border-blue-300/10 dark:bg-blue-300/10 dark:text-blue-300 dark:hover:bg-blue-300/20"
                onClick={addEmptyVital}
              >
                + Thêm chỉ số
              </button>
            </div>
          </div>

          {groups && groups.length > 0 && <div />}

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {groups.map((g, idx) => (
              <CheckupVitalGroupInput
                key={`group-${idx}`}
                index={idx}
                wsId={ws.id}
                group={g}
                blacklist={groups.map((v) => v.id)}
                updateGroupId={updateGroupId}
                removeGroup={removeGroup}
                addVitals={addVitals}
              />
            ))}
          </div>

          {groups && groups.length > 0 && vitals && vitals.length > 0 && (
            <Divider className="col-span-full my-2 w-full" />
          )}

          {vitals.map((v, idx) => (
            <CheckupVitalInput
              key={`vital-${idx}`}
              vital={v}
              blacklist={vitals.map((v) => v.id)}
              removeVital={() => removeVital(idx)}
              updateVital={(vital) => updateVital(idx, vital)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
