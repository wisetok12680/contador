declare module 'react-native-get-sms-android' {
  export interface SmsFilter {
    box?: 'inbox' | 'sent' | 'draft' | 'outbox' | 'failed' | 'queued' | 'all';
    read?: number;
    id?: number;
    address?: string;
    body?: string;
    indexFrom?: number;
    maxCount?: number;
  }

  export interface SmsMessage {
    _id: number;
    thread_id: number;
    address: string;
    person: number | null;
    date: number;
    date_sent: number;
    protocol: number | null;
    read: number;
    status: number;
    type: number;
    body: string;
    service_center: string | null;
    locked: number;
    error_code: number;
    sub_id: number;
    seen: number;
  }

  const SmsAndroid: {
    list: (
      filter: string,
      failCallback: (error: string) => void,
      successCallback: (count: number, smsList: string) => void
    ) => void;
  };

  export default SmsAndroid;
}
