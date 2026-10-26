source "https://rubygems.org"

gem 'sinatra', '~> 4.2'
gem 'sinatra-xsendfile'

gem 'json'
gem 'mini_magick', '~> 5.4'

group :production do
  gem 'thin'
end

group :test, :development do
  gem 'sinatra-contrib'
end

group :test do
  gem 'minitest'
  gem 'rack-test'
end
