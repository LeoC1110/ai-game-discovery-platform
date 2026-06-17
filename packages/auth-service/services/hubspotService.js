const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

const isHubSpotEnabled = () => {
  const enabledFlag = String(process.env.HUBSPOT_ENABLED || '').toLowerCase();
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  return enabledFlag === 'true' && Boolean(token);
};

const buildContactPayload = ({ email, username, emailVerified } = {}) => ({
  inputs: [
    {
      idProperty: 'email',
      id: email,
      properties: {
        email,
        username,
        firstname: username,
        lifecycle_stage: emailVerified ? 'customer' : 'lead',
        ai_game_platform_user: 'true',
      },
    },
  ],
});

export async function syncContactToHubSpot({ email, username, emailVerified = false } = {}) {
  if (!email || !username || !isHubSpotEnabled()) {
    return { attempted: false, ok: false };
  }

  const response = await fetch(`${HUBSPOT_BASE_URL}/crm/v3/objects/contacts/batch/upsert`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildContactPayload({ email, username, emailVerified })),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HubSpot sync failed (${response.status}): ${text}`);
  }

  return { attempted: true, ok: true };
}

export async function updateContactLifecycleStage({ email, lifecycleStage = 'customer' } = {}) {
  if (!email || !isHubSpotEnabled()) {
    return { attempted: false, ok: false };
  }

  const response = await fetch(`${HUBSPOT_BASE_URL}/crm/v3/objects/contacts/batch/upsert`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: [
        {
          idProperty: 'email',
          id: email,
          properties: {
            lifecycle_stage: lifecycleStage,
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HubSpot lifecycle update failed (${response.status}): ${text}`);
  }

  return { attempted: true, ok: true };
}
