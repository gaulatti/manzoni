import { useEffect, useState } from 'react';

import type { UploadQueueController, UploadQueueSnapshot } from '../services/uploadQueueController';

export function useUploadQueue(controller: UploadQueueController): UploadQueueSnapshot {
  const [snapshot, setSnapshot] = useState(controller.getSnapshot());

  useEffect(() => controller.subscribe(setSnapshot), [controller]);

  return snapshot;
}
