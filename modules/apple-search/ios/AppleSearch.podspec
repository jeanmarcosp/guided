Pod::Spec.new do |s|
  s.name           = 'AppleSearch'
  s.version        = '1.0.0'
  s.summary        = 'Apple MKLocalSearch bridge for the guide app'
  s.description    = 'Local Expo module exposing MKLocalSearch to JavaScript.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.license        = 'MIT'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
