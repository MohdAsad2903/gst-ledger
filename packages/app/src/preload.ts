import { contextBridge, ipcRenderer } from 'electron';
import type {
  ApiClient,
  CalcDemoInput,
  CalcDemoResult,
  SystemHealth,
  AppSettingsSnapshot,
  StateRow,
  TaxRateProfileRow,
  BackupRecordDTO,
  VerifyReportDTO,
} from './ipc/contract.js';
import type { Result } from '@gst/core';

const api: ApiClient = {
  system: {
    getHealth: (): Promise<SystemHealth> => ipcRenderer.invoke('system:getHealth'),
    getSettings: (): Promise<AppSettingsSnapshot> => ipcRenderer.invoke('system:getSettings'),
    setSetting: (key: string, value: unknown): Promise<Result<void, string>> =>
      ipcRenderer.invoke('system:setSetting', key, value),
  },
  backup: {
    list: (): Promise<BackupRecordDTO[]> => ipcRenderer.invoke('backup:list'),
    create: (): Promise<Result<BackupRecordDTO, string>> => ipcRenderer.invoke('backup:create'),
    verify: (id: string): Promise<Result<VerifyReportDTO, string>> =>
      ipcRenderer.invoke('backup:verify', id),
  },
  masters: {
    getStates: (): Promise<StateRow[]> => ipcRenderer.invoke('masters:getStates'),
    getRates: (): Promise<TaxRateProfileRow[]> => ipcRenderer.invoke('masters:getRates'),
  },
  calc: {
    demo: (input: CalcDemoInput): Promise<CalcDemoResult> => ipcRenderer.invoke('calc:demo', input),
  },
};

contextBridge.exposeInMainWorld('api', api);
