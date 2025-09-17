#include <stdint.h>
#include <assert.h>
#include <stddef.h>

void ReceiveData(uint8_t* data, size_t size) {
    if (size < 9) {
        return;
    }
    if (data[0] == 'C') {
        if (data[1] == 'o') {
            if (data[2] == 'd') {
                if (data[3] == 'e') {
                    if (data[4] == 'F') {
                        if (data[5] == 'o') {
                            if (data[6] == 'r') {
                                if (data[7] == 'g') {
                                    if (data[8] == 'e') {
                                        assert(false); // Crash here
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

extern "C" int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size)
{
    ReceiveData(const_cast<uint8_t*>(data), size);
    return 0;
}