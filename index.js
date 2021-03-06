var aws = require('aws-sdk')
var extend = require('xtend')
var crypto = require('crypto')
var stream = require('stream')
var fileType = require('file-type')

function getFilename (req, file, cb) {
  crypto.pseudoRandomBytes(16, function (err, raw) {
    cb(err, err ? undefined : raw.toString('hex'))
  })
}

function defaultContentType (req, file, cb) {
  setImmediate(function () { cb(null, 'application/octet-stream') })
}

function autoContentType (req, file, cb) {
  file.stream.once('data', function (firstChunk) {
    var type = fileType(firstChunk)
    var mime = (type === null ? 'application/octet-stream' : type.mime)
    var outStream = new stream.PassThrough()

    outStream.write(firstChunk)
    file.stream.pipe(outStream)

    cb(null, mime, outStream)
  })
}

function S3Storage (opts) {
  if (!opts.bucket) throw new Error('bucket is required')
  if (!opts.region) throw new Error('region is required')

  var s3cfg = extend(opts, { apiVersion: '2006-03-01' })

  delete s3cfg.bucket

  this.options = opts
  this.getFilename = (opts.filename || getFilename)
  this.getContentType = (opts.contentType || defaultContentType)
  this.s3 = new aws.S3(s3cfg)
}

S3Storage.prototype._handleFile = function (req, file, cb) {
  var that = this
  that.getFilename(req, file, function (err, filename) {
    that.getContentType(req, file, function (err, contentType, _stream) {
      var currentSize = 0
      var filePath = filename

      var upload = that.s3.upload({
        Bucket: that.options.bucket,
        Key: filePath,
        ContentType: contentType,
        Body: (_stream || file.stream)
      })

      upload.on('httpUploadProgress', function (ev) {
        if (ev.total) currentSize = ev.total
      })

      upload.send(function (err) {
        if (err) return cb(err)

        cb(null, { size: currentSize, key: filePath })
      })
    })
  })
}

S3Storage.prototype._removeFile = function (req, file, cb) {
  this.s3.deleteObject({ Bucket: this.options.bucket, Key: file.key }, cb)
}

module.exports = function (opts) {
  return new S3Storage(opts)
}

module.exports.AUTO_CONTENT_TYPE = autoContentType
module.exports.DEFAULT_CONTENT_TYPE = defaultContentType
