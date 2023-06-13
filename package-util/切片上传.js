for (var i = 0; i < shardCount; i++) {
  var start = i * shardSize;
  var end = Math.min(singleFile.size, start + shardSize);
  //在file.size和start+shardSize中取最小值，避免切片越界
  var file = singleFile.slice(start, end);
  var formData = new FormData();
  formData.append('shardCount', shardCount);
  formData.append('currentShard', i);
  formData.append('file', file);
  formData.append('relativePath', uploadMonitor.relativePath);
  formData.append('uploadFileName', originFileName);
  formData.append('finalFileName', uploadMonitor.finalFileName);
  formData.append('identification', uploadMonitor.identification);
  formData.append('extension', uploadMonitor.extension);
  $.ajax({
    async: false,
    url: uploadLocal,
    cache: false,
    type: 'POST',
    data: formData,
    dateType: 'json',
    processData: false,
    contentType: false,
    xhr: function () {
      var myXhr = $.ajaxSettings.xhr();
      uploadMonitor.shardCount = shardCount;
      uploadMonitor.shard = i;
      myXhr.onload = uploadMonitor.onload;
      return myXhr;
    },
  });
}