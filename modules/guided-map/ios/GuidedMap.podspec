Pod::Spec.new do |s|
  s.name           = 'GuidedMap'
  s.version        = '1.0.0'
  s.summary        = 'Native MKMapView with built-in Apple Maps clustering'
  s.description    = 'Local Expo module hosting MKMapView; annotations are data props and clustering is MapKit-native (MKClusterAnnotation).'
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
