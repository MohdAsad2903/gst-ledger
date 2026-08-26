import { contextBridge, ipcRenderer } from 'electron';
import type { ApiClient, CalcDemoInput, IpcContract } from './ipc/contract.js';

/**
 * Type-safe IPC invocation helper linked directly to IpcContract.
 * Wrong channel names or argument type mismatches cause compile-time errors.
 */
function invoke<K extends keyof IpcContract>(
  channel: K,
  ...args: Parameters<IpcContract[K]>
): ReturnType<IpcContract[K]> {
  return ipcRenderer.invoke(channel, ...args) as ReturnType<IpcContract[K]>;
}

const api: ApiClient = {
  system: {
    getHealth: () => invoke('system:getHealth'),
    getSettings: () => invoke('system:getSettings'),
    setSetting: (key: string, value: unknown) => invoke('system:setSetting', key, value),
  },
  backup: {
    list: () => invoke('backup:list'),
    create: () => invoke('backup:create'),
    verify: (id: string) => invoke('backup:verify', id),
  },
  masters: {
    getStates: () => invoke('masters:getStates'),
    getRates: () => invoke('masters:getRates'),
  },
  calc: {
    demo: (input: CalcDemoInput) => invoke('calc:demo', input),
  },
};

contextBridge.exposeInMainWorld('api', api);
