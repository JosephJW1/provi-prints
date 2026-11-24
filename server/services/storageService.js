const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { generateWatermarkedPreview } = require('../utils/imageProcessor');

/**
 * Initializes and returns an S3Client configured for Cloudflare R2.
 * @returns {import('@aws-sdk/client-s3').S3Client}
 */
function getR2Client() {
  const accountId = (process.env.R2_ACCOUNT_ID || '').trim();
  const accessKeyId = (process.env.R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || '').trim();

  if (
    !accountId ||
    !accessKeyId ||
    !secretAccessKey ||
    accountId === 'your_cloudflare_account_id' ||
    accessKeyId === 'your_r2_access_key_id'
  ) {
    const err = new Error(
      'Cloudflare R2 credentials are not configured. Please set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY in server/.env.'
    );
    err.isClientSafe = true;
    err.statusCode = 500;
    throw err;
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

/**
 * Generates a low-resolution watermarked WebP preview from the master Buffer,
 * uploads the high-res 300 DPI master to the PRIVATE R2 bucket (under masters/),
 * and uploads the watermarked preview to the PUBLIC R2 bucket (under previews/).
 *
 * @param {Buffer} masterFileBuffer
 * @param {string} originalFilename
 * @param {string} mimeType
 * @returns {Promise<{ image_url: string, publicPreviewKey: string, privateMasterKey: string }>}
 */
async function uploadNewDesignAssets(masterFileBuffer, originalFilename, mimeType) {
  const r2Client = getR2Client();
  const privateBucket = process.env.R2_PRIVATE_BUCKET_NAME || 'design-masters-private';
  const publicBucket = process.env.R2_PUBLIC_BUCKET_NAME || 'design-previews-public';
  const publicDomain = (process.env.R2_PUBLIC_DOMAIN || '').replace(/\/+$/, '');

  if (!publicDomain || publicDomain.includes('pub-xxxxxxxxxxxx')) {
    const err = new Error(
      'R2_PUBLIC_DOMAIN is not configured. Please set your public R2 bucket URL in server/.env.'
    );
    err.isClientSafe = true;
    err.statusCode = 500;
    throw err;
  }

  // 1. Validate magic bytes/dimensions & generate the low-res watermarked WebP preview via sharp
  const storeName = process.env.STORE_NAME || 'PROVI-PRINTS';
  const { previewBuffer, previewFilename, verifiedMimeType } = await generateWatermarkedPreview(
    masterFileBuffer,
    originalFilename,
    storeName
  );

  // Sanitize original filename for object storage key
  const safeOriginalName = originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_');

  // 2. Upload the high-resolution master file to the PRIVATE bucket using verified MIME type
  const privateMasterKey = `masters/master-${Date.now()}-${safeOriginalName}`;
  await r2Client.send(
    new PutObjectCommand({
      Bucket: privateBucket,
      Key: privateMasterKey,
      Body: masterFileBuffer,
      ContentType: verifiedMimeType || mimeType,
    })
  );

  // 3. Upload the low-resolution watermarked preview to the PUBLIC bucket
  const publicPreviewKey = `previews/${previewFilename}`;
  await r2Client.send(
    new PutObjectCommand({
      Bucket: publicBucket,
      Key: publicPreviewKey,
      Body: previewBuffer,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );

  // 4. Construct the public URL stored in Design.image_url
  const image_url = `${publicDomain}/${publicPreviewKey}`;

  return {
    image_url,
    publicPreviewKey,
    privateMasterKey,
  };
}

/**
 * Generates a temporary (default 15-minute) presigned download URL for a high-resolution
 * master file in the private R2 bucket. Used exclusively by authenticated admins or print fulfillment.
 *
 * @param {string} privateMasterKey
 * @param {number} [expiresInSeconds=900]
 * @returns {Promise<string>}
 */
async function getTemporaryMasterDownloadUrl(privateMasterKey, expiresInSeconds = 900) {
  const r2Client = getR2Client();
  const privateBucket = process.env.R2_PRIVATE_BUCKET_NAME || 'design-masters-private';

  const rawFilename = privateMasterKey.split('/').pop() || 'design-master';
  const safeFilename = rawFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const command = new GetObjectCommand({
    Bucket: privateBucket,
    Key: privateMasterKey,
    ResponseContentDisposition: `attachment; filename="${safeFilename}"`,
  });

  const signedUrl = await getSignedUrl(r2Client, command, {
    expiresIn: expiresInSeconds,
  });

  return signedUrl;
}

/**
 * Generates a 48-hour presigned URL (inline, no attachment header) specifically for
 * Prodigi API v4 print fulfillment workers to fetch the private 300 DPI master file.
 *
 * @param {string} privateMasterKey
 * @param {number} [expiresInSeconds=172800]
 * @returns {Promise<string>}
 */
async function getProdigiMasterAssetUrl(privateMasterKey, expiresInSeconds = 172800) {
  const r2Client = getR2Client();
  const privateBucket = process.env.R2_PRIVATE_BUCKET_NAME || 'design-masters-private';

  const command = new GetObjectCommand({
    Bucket: privateBucket,
    Key: privateMasterKey,
  });

  return getSignedUrl(r2Client, command, {
    expiresIn: expiresInSeconds,
  });
}

/**
 * Deletes both the public watermarked preview and the private high-resolution master
 * from their respective Cloudflare R2 buckets when a Design record is deleted.
 *
 * @param {string | null | undefined} publicPreviewKey
 * @param {string | null | undefined} privateMasterKey
 * @returns {Promise<void>}
 */
async function deleteDesignAssets(publicPreviewKey, privateMasterKey) {
  const r2Client = getR2Client();
  const privateBucket = process.env.R2_PRIVATE_BUCKET_NAME || 'design-masters-private';
  const publicBucket = process.env.R2_PUBLIC_BUCKET_NAME || 'design-previews-public';

  const deletions = [];

  if (publicPreviewKey) {
    deletions.push(
      r2Client.send(
        new DeleteObjectCommand({
          Bucket: publicBucket,
          Key: publicPreviewKey,
        })
      )
    );
  }

  if (privateMasterKey) {
    deletions.push(
      r2Client.send(
        new DeleteObjectCommand({
          Bucket: privateBucket,
          Key: privateMasterKey,
        })
      )
    );
  }

  await Promise.all(deletions);
}

module.exports = {
  uploadNewDesignAssets,
  getTemporaryMasterDownloadUrl,
  getProdigiMasterAssetUrl,
  deleteDesignAssets,
};
