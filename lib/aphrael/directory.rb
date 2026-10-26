require 'uri'

class Aphrael::Directory < Aphrael::Resource

  def self.get index, path
    @cache ||= {}
    index = index.to_i
    real_path = self.real_path(index, path)
    unless directory = @cache[real_path]
      directory = self.new(index, path)
    end
    directory
  end

  def initialize index, path
    super
  end

  def children
    create_index
    @children
  end

  def images length=nil
    create_index length
    @images
  end

  def create_index length=nil
    unless defined?(@children)
      @children = []
      @images = []
      Dir.entries(real_path).sort.each do |file|
        if length && @images.size >= length
          break
        end
        next if file.start_with?('.')
        real_file_path = File.join(real_path, file)
        if File.directory?(real_file_path)
          _path = [path, file]
          _path.delete('')
          @children << self.class.get(index, File.join(*_path))
        elsif File.file?(real_file_path) && Aphrael::Image::SUPPORTED_FORMATS.include?(File.extname(real_file_path))
          @images << Aphrael::Image.get(index, File.join(path, file))
        end
      end
    end
  end

  def to_h
    return {
      path: URI::RFC2396_PARSER.escape(path),
      name: URI::RFC2396_PARSER.escape(File.basename(path)),
    }
  end

end
