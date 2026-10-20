const DRIVE_FOLDER_NAME = "Space Tab";
const DRIVE_FILE_NAME = "space-tab.json";
const FINANCE_FILE_NAME = "finance.json";
const BODY_METRICS_FILE_NAME = "body-metrics.json";

function buildMultipartBody(metadata, jsonData) {
  const boundary = `space-tab-${Date.now()}`;
  const delimiter = `--${boundary}`;
  const closeDelimiter = `--${boundary}--`;
  const body =
    `${delimiter}\r\n` +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    `${JSON.stringify(metadata)}\r\n` +
    `${delimiter}\r\n` +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    `${JSON.stringify(jsonData, null, 2)}\r\n` +
    `${closeDelimiter}`;

  return {
    body,
    contentType: `multipart/related; boundary=${boundary}`
  };
}

async function requestDrive(token, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });

  if (response.status === 401) {
    const error = new Error("AUTH_EXPIRED");
    error.code = "AUTH_EXPIRED";
    throw error;
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Drive request failed: ${response.status}`);
  }

  return response;
}

async function ensureFolder(token) {
  const folderQuery = encodeURIComponent(
    `name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const searchRes = await requestDrive(
    token,
    `https://www.googleapis.com/drive/v3/files?q=${folderQuery}&fields=files(id,name)&pageSize=1`
  );
  const searchJson = await searchRes.json();
  const existingFolderId = searchJson.files?.[0]?.id || null;

  if (existingFolderId) return existingFolderId;

  const createRes = await requestDrive(
    token,
    "https://www.googleapis.com/drive/v3/files?fields=id,name",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: DRIVE_FOLDER_NAME,
        mimeType: "application/vnd.google-apps.folder"
      })
    }
  );
  const created = await createRes.json();
  return created.id;
}

async function findBackupFile(token, folderId) {
  return findNamedFile(token, folderId, DRIVE_FILE_NAME);
}

async function findNamedFile(token, folderId, fileName) {
  const query = encodeURIComponent(`name='${fileName}' and '${folderId}' in parents and trashed=false`);
  const searchRes = await requestDrive(
    token,
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,webViewLink)&pageSize=1`
  );
  const searchJson = await searchRes.json();
  return searchJson.files?.[0] || null;
}

async function updateExistingFile(token, fileId, payload, fileName = DRIVE_FILE_NAME) {
  const multipart = buildMultipartBody({ mimeType: "application/json", name: fileName }, payload);
  const updateRes = await requestDrive(
    token,
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id,name,webViewLink`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": multipart.contentType
      },
      body: multipart.body
    }
  );
  return updateRes.json();
}

async function createBackupFile(token, payload, folderId, fileName = DRIVE_FILE_NAME) {
  const multipart = buildMultipartBody(
    {
      name: fileName,
      mimeType: "application/json",
      parents: [folderId]
    },
    payload
  );

  const createRes = await requestDrive(
    token,
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
    {
      method: "POST",
      headers: {
        "Content-Type": multipart.contentType
      },
      body: multipart.body
    }
  );
  return createRes.json();
}

export async function saveSpaceTabDataToDrive(token, payloadData) {
  return saveNamedDataToDrive(token, DRIVE_FILE_NAME, payloadData);
}

export async function saveFinanceDataToDrive(token, payloadData) {
  return saveNamedDataToDrive(token, FINANCE_FILE_NAME, payloadData);
}

export async function saveBodyMetricsDataToDrive(token, payloadData) {
  return saveNamedDataToDrive(token, BODY_METRICS_FILE_NAME, payloadData);
}

async function saveNamedDataToDrive(token, fileName, payloadData) {
  const payload = {
    updatedAt: new Date().toISOString(),
    data: payloadData
  };

  const folderId = await ensureFolder(token);
  const existingFile = await findNamedFile(token, folderId, fileName);

  if (existingFile?.id) {
    const updated = await updateExistingFile(token, existingFile.id, payload, fileName);
    return {
      id: updated.id,
      name: updated.name,
      webViewLink: updated.webViewLink || null,
      folderId
    };
  }

  const created = await createBackupFile(token, payload, folderId, fileName);
  return {
    id: created.id,
    name: created.name,
    webViewLink: created.webViewLink || null,
    folderId
  };
}

export async function loadSpaceTabDataFromDrive(token) {
  return loadNamedDataFromDrive(token, DRIVE_FILE_NAME);
}

export async function loadFinanceDataFromDrive(token) {
  return loadNamedDataFromDrive(token, FINANCE_FILE_NAME);
}

export async function loadBodyMetricsDataFromDrive(token) {
  return loadNamedDataFromDrive(token, BODY_METRICS_FILE_NAME);
}

async function loadNamedDataFromDrive(token, fileName) {
  const folderId = await ensureFolder(token);
  const existingFile = await findNamedFile(token, folderId, fileName);
  if (!existingFile?.id) {
    return {
      data: null,
      file: null,
      folderId
    };
  }

  const fileRes = await requestDrive(
    token,
    `https://www.googleapis.com/drive/v3/files/${existingFile.id}?alt=media`
  );
  const fileData = await fileRes.json();

  return {
    data: fileData?.data || null,
    file: {
      id: existingFile.id,
      name: existingFile.name,
      webViewLink: existingFile.webViewLink || null
    },
    folderId
  };
}
