import { test, expect } from '@playwright/test';

test('monthly free time sums daily budgets without cancelling overloaded days', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2025, 0, 1, 12));
  await page.goto('/planner/schedule');
  await page.locator('.schedule-baseline-panel > summary').click();
  await page.getByRole('button', { name: '管理时间基线' }).click();
  await page.getByRole('button', { name: '保存时间基线', exact: true }).click();
  await page.evaluate(() => {
    const key = 'edu.prototype.v1.workspace';
    const data = JSON.parse(localStorage.getItem(key)!);
    data.schedule = [{ id: 'monthly-extra', title: '额外安排', date: '2026-10-21', start: '18:00', end: '22:00', type: 'schedule', category: 'personal', note: '', spaceId: '', taskId: '', allDay: false }];
    data.scheduleSettings.calendarHolidays = [
      { date: '2026-10-01', name: '假期', kind: 'holiday', source: 'timor.tech', updatedAt: new Date().toISOString() },
      { date: '2026-10-10', name: '补班', kind: 'makeup-workday', source: 'timor.tech', updatedAt: new Date().toISOString() },
    ];
    localStorage.setItem(key, JSON.stringify(data));
  });
  await page.reload();
  await page.locator('.schedule-view-toolbar input[type="date"]').fill('2026-10-21');
  await page.getByRole('button', { name: '月视图', exact: true }).click();
  // 22 workdays, 9 rest days: 22*3.5 + 9*12.5 - 3.5 = 186 hours.
  await expect(page.locator('.schedule-month-free')).toHaveText('剩余可安排 186小时');
  await expect(page.locator('.schedule-month-over')).toHaveText('1 天超额');
  await page.locator('.schedule-period-details > summary').click();
  await expect(page.locator('.schedule-month-summary')).toContainText('30分钟');
  await expect(page.locator('.schedule-month-budget-note')).toContainText('31 天');
  await page.getByRole('button', { name: '周视图', exact: true }).click();
  await expect(page.locator('.schedule-week-free')).toHaveText('剩余可安排 39小时');
  await expect(page.locator('.schedule-week-over')).toHaveText('1 天超额');
  await page.locator('.schedule-view-toolbar input[type="date"]').fill('2026-10-01');
  await expect(page.locator('.schedule-week-free')).toHaveText('剩余可安排 51小时30分钟');
  await page.locator('.schedule-period-details > summary').click();
  await expect(page.locator('.schedule-week-budget-note')).toContainText('2026-09-28 至 2026-10-04');
  await page.locator('.schedule-view-toolbar input[type="date"]').fill('2026-10-10');
  await expect(page.locator('.schedule-week-free')).toHaveText('剩余可安排 33小时30分钟');
  await expect(page.locator('.schedule-week-over')).toHaveCount(0);
  await page.getByRole('button', { name: '月视图', exact: true }).click();
  await page.locator('.schedule-period-details > summary').click();
  await page.locator('.schedule-view-toolbar input[type="date"]').fill('2028-02-01');
  // Leap February has 21 weekdays and 8 weekend days; adjacent grid dates are excluded.
  await expect(page.locator('.schedule-month-free')).toHaveText('剩余可安排 173小时30分钟');
  await expect(page.locator('.schedule-month-budget-note')).toContainText('29 天');
  await expect(page.locator('.schedule-month-over')).toHaveCount(0);
});

test('current periods count only time from now and past periods have no remaining budget', async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 9, 21, 11) });
  await page.clock.pauseAt(new Date(2026, 9, 21, 12));
  await page.goto('/planner/schedule');
  await page.locator('.schedule-baseline-panel > summary').click();
  await page.getByRole('button', { name: '管理时间基线' }).click();
  await page.getByRole('button', { name: '保存时间基线', exact: true }).click();
  await page.evaluate(() => {
    const key = 'edu.prototype.v1.workspace', data = JSON.parse(localStorage.getItem(key)!);
    data.schedule = [];
    data.scheduleSettings.calendarHolidays = [];
    localStorage.setItem(key, JSON.stringify(data));
  });
  await page.reload();
  await page.getByRole('button', { name: '周视图', exact: true }).click();
  await expect(page.locator('.schedule-week-free')).toHaveText('剩余可安排 34小时');
  await page.getByRole('button', { name: '月视图', exact: true }).click();
  await expect(page.locator('.schedule-month-free')).toHaveText('剩余可安排 64小时');
  // Once work ends, each passing minute reduces the unallocated time.
  await page.clock.fastForward(6 * 60 * 60 * 1000);
  await expect(page.locator('.schedule-month-free')).toHaveText('剩余可安排 64小时');
  await page.clock.runFor(60_000);
  await expect(page.locator('.schedule-month-free')).toHaveText('剩余可安排 63小时59分钟');
  await page.locator('.schedule-view-toolbar input[type="date"]').fill('2026-09-01');
  await expect(page.locator('.schedule-month-free')).toHaveText('剩余可安排 0分钟');
  await page.getByRole('button', { name: '周视图', exact: true }).click();
  await expect(page.locator('.schedule-week-free')).toHaveText('剩余可安排 0分钟');
});

test('work baseline respects weekends, holidays and makeup days and saves its option', async ({ page }) => {
  await page.goto('/planner/schedule');
  await page.locator('.schedule-baseline-panel > summary').click();
  await page.getByRole('button', { name: '管理时间基线' }).click();
  await expect(page.getByLabel('仅工作日计入工作时间')).toBeChecked();
  await page.getByRole('button', { name: '保存时间基线', exact: true }).click();
  await page.evaluate(() => {
    const key = 'edu.prototype.v1.workspace';
    const data = JSON.parse(localStorage.getItem(key)!);
    data.scheduleSettings.calendarHolidays = [
      { date: '2026-10-01', name: '国庆节', kind: 'holiday', source: 'timor.tech', updatedAt: new Date().toISOString() },
      { date: '2026-10-10', name: '补班', kind: 'makeup-workday', source: 'timor.tech', updatedAt: new Date().toISOString() },
    ];
    localStorage.setItem(key, JSON.stringify(data));
  });
  await page.reload();
  const date = page.locator('.schedule-view-toolbar input[type="date"]');
  for (const [value, hours] of [['2026-10-21', 9], ['2026-10-24', 0], ['2026-10-01', 0], ['2026-10-10', 9]] as const) {
    await date.fill(value);
    await expect(page.locator('.schedule-budget-breakdown')).toContainText(hours ? '工作 9小时' : '工作 0分钟');
    await expect(page.locator('.schedule-stat-card').first()).toContainText(hours ? '20小时30分钟' : '11小时30分钟');
  }
  await page.locator('.schedule-baseline-panel > summary').click();
  await page.getByRole('button', { name: '管理时间基线' }).click();
  await page.getByLabel('仅工作日计入工作时间').uncheck();
  await page.getByRole('button', { name: '保存时间基线', exact: true }).click();
  await page.reload();
  await date.fill('2026-10-24');
  await expect(page.locator('.schedule-budget-breakdown')).toContainText('工作 9小时');
  await page.locator('.schedule-baseline-panel > summary').click();
  await page.getByRole('button', { name: '管理时间基线' }).click();
  await expect(page.getByLabel('仅工作日计入工作时间')).not.toBeChecked();
});

test('schedule supports linked actions, holidays and daily time budget', async ({ page }) => {
  await page.goto('/planner/schedule');
  await page.getByRole('button', { name: '添加日程', exact: true }).click();
  await page.getByLabel('名称').fill('准备导师组会');
  await page.locator('#schedule-start').fill('10:30');
  await page.locator('#schedule-end').fill('11:15');
  await page.getByLabel('关联行动（可留空）').selectOption('t1');
  await page.getByRole('button', { name: '加入日程' }).click();
  await expect(page.getByText('准备导师组会', { exact: true })).toBeVisible();
  const linked = await page.evaluate(() => JSON.parse(localStorage.getItem('edu.prototype.v1.workspace')!).schedule.find((entry: { title: string }) => entry.title === '准备导师组会'));
  expect(linked).toMatchObject({ taskId: 't1', spaceId: 'research', start: '10:30', end: '11:15' });

  await page.getByRole('button', { name: '标记节假日', exact: true }).click();
  await page.getByLabel('名称').fill('年度休假日');
  await expect(page.getByLabel(/全天安排/)).toBeChecked();
  await page.getByRole('button', { name: '加入日程' }).click();
  await expect(page.locator('.schedule-special-panel')).toContainText('年度休假日');

  await page.locator('.schedule-baseline-panel > summary').click();
  await page.getByRole('button', { name: '管理时间基线', exact: false }).click();
  await page.locator('#baseline-end-work').fill('17:00');
  await page.getByRole('button', { name: '新增时间安排', exact: true }).click();
  await page.getByLabel('时间安排名称 6').fill('午休散步');
  await page.getByLabel('每天预算分钟').last().fill('30');
  await page.getByRole('button', { name: '保存时间基线', exact: true }).click();
  await expect(page.locator('.schedule-stat-card').first()).toContainText('12小时');
  await expect(page.locator('.schedule-baseline-panel')).toContainText('午休散步');

  await page.getByRole('button', { name: '月视图', exact: true }).click();
  await expect(page.locator('.schedule-month-grid')).toBeVisible();
  await expect(page.locator('.schedule-month-summary')).toContainText('本月安排');
  await page.route('https://timor.tech/api/holiday/year/2026?type=Y&week=Y', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ holiday: { '10-01': { holiday: true, name: '国庆节' } }, type: { '2026-10-01': { type: 2, name: '国庆节' }, '2026-10-03': { type: 1, name: '周六' }, '2026-10-10': { type: 3, name: '国庆节补班' } } }) }));
  await page.getByRole('button', { name: /同步 2026 年节假日/ }).click();
  await expect(page.locator('.schedule-holiday-tools')).toContainText('已同步');
  await expect(page.getByRole('status')).toContainText('已同步并保存到浏览器工作区');
  const storedHolidays = await page.evaluate(() => JSON.parse(localStorage.getItem('edu.prototype.v1.workspace')!).scheduleSettings.calendarHolidays);
  expect(storedHolidays).toEqual(expect.arrayContaining([
    expect.objectContaining({ date: '2026-10-01', kind: 'holiday', source: 'timor.tech' }),
    expect.objectContaining({ date: '2026-10-10', kind: 'makeup-workday', source: 'timor.tech' }),
  ]));
  await page.reload();
  await page.locator('.schedule-view-toolbar input[type="date"]').fill('2026-10-10');
  await page.getByRole('button', { name: '月视图', exact: true }).click();
  await expect(page.locator('.schedule-month-cell.makeup')).toHaveCount(1);
  await page.locator('.schedule-month-cell.selected .schedule-month-date-button').click();
  await expect(page.locator('.schedule-layout')).toBeVisible();
  await expect(page.locator('.schedule-month-grid')).toHaveCount(0);

  await page.getByRole('button', { name: '周视图', exact: true }).click();
  await expect(page.locator('.schedule-week-grid')).toBeVisible();
  await expect(page.locator('.schedule-period-summary-grid')).toContainText('本周安排');
});